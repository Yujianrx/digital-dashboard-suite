import { DatabaseSync } from "node:sqlite";
import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { validateDataset, validDate } from "../src/restaurant/model.mjs";
export async function atomicJson(path, value) {
  const temp = path + "." + randomBytes(4).toString("hex") + ".tmp";
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, path);
}
export function validateSnapshot(db, metadata) {
  const stored = JSON.parse(
    db.prepare("SELECT value FROM meta WHERE key='snapshot'").get().value,
  );
  if (
    stored.generation !== metadata.generation ||
    stored.asOf !== metadata.asOf ||
    metadata.version !== 1 ||
    !validDate(metadata.cycle) ||
    !Number.isFinite(Date.parse(metadata.completedAt))
  )
    throw Error("候选元数据无效");
  const stores = db
    .prepare("SELECT json FROM stores")
    .all()
    .map((r) => JSON.parse(r.json));
  const base = {
    schemaVersion: 1,
    meta: {
      mode: "real",
      timezone: "Asia/Shanghai",
      source: "候选数据库快照",
      revenueDefinition: "已核实源字段",
      revenueLabel: "总收入",
      warnings: [],
      coverage: { start: metadata.firstSale, end: metadata.asOf },
    },
    stores,
    facts: [],
    overviewFacts: [],
    targets: [],
    capacity: [],
    activities: [],
    members: [],
    dishes: [],
  };
  validateDataset(base);
  for (const [key, sql] of [
    [
      "facts",
      "SELECT day AS date,store AS storeId,channel,revenue,orders FROM facts",
    ],
    [
      "overviewFacts",
      "SELECT day AS date,store AS storeId,revenue,orders FROM overview",
    ],
  ]) {
    let batch = [];
    for (const row of db.prepare(sql).iterate()) {
      batch.push(row);
      if (batch.length === 5000) {
        validateDataset({ ...base, [key]: batch });
        batch = [];
      }
    }
    if (batch.length) validateDataset({ ...base, [key]: batch });
  }
  const safe = (n) => typeof n === "number" && Number.isSafeInteger(n);
  for (const [table, columns] of [
    ["recharge", ["amount", "records"]],
    ["spending", ["amount"]],
    ["cohorts", ["members", "balance"]],
  ]) {
    const totals = db
      .prepare(
        `SELECT ${columns.map((c) => `total(abs(${c})) AS ${c}`).join(",")} FROM ${table}`,
      )
      .get();
    if (columns.some((c) => !safe(totals[c])))
      throw Error("快照数值超过安全整数范围");
  }
  for (const row of db.prepare("SELECT day,records FROM recharge").iterate())
    if (!validDate(row.day) || row.records < 0)
      throw Error("储值日期或记录数无效");
  for (const row of db.prepare("SELECT day FROM spending").iterate())
    if (!validDate(row.day)) throw Error("消费日期无效");
  for (const row of db.prepare("SELECT * FROM cohorts").iterate())
    if (
      !validDate(row.created) ||
      (row.registered && !validDate(row.registered)) ||
      !safe(row.members) ||
      row.members < 0 ||
      !safe(row.balance)
    )
      throw Error("会员资产分组无效");
  for (const row of db
    .prepare("SELECT day,customer,receipt,seenNew,seenOld FROM consumption")
    .iterate()) {
    if (
      !validDate(row.day) ||
      ![row.customer, row.receipt].every(
        (key) => key === "" || /^[A-F0-9]{64}$/.test(key),
      ) ||
      ![row.seenNew, row.seenOld].every((n) => n === 0 || n === 1)
    )
      throw Error("会员去重键、标签或日期无效");
  }
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw Error("SQLite完整性检查失败");
}
export async function publishSnapshot(directory, metadata) {
  if (!/^snapshot-\d{13}-[a-f0-9]{8}\.sqlite$/.test(metadata.generation))
    throw Error("候选快照路径无效");
  const db = new DatabaseSync(join(directory, metadata.generation), {
    readOnly: true,
  });
  try {
    validateSnapshot(db, metadata);
  } finally {
    db.close();
  }
  let old;
  try {
    old = JSON.parse(await readFile(join(directory, "current.json"), "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await atomicJson(join(directory, "current.json"), {
    ...metadata,
    previousGeneration:
      old?.generation === metadata.generation
        ? old.previousGeneration
        : old?.generation,
  });
}
