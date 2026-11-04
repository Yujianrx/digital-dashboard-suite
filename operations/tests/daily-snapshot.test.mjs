import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { publishSnapshot } from "../server/snapshot-publish.mjs";
import { createSnapshotDb, insertRows } from "../server/snapshot-schema.mjs";
import { SnapshotReader } from "../server/snapshot-reader.mjs";
import {
  SnapshotService,
  dueCycle,
  nextRun,
} from "../server/snapshot-service.mjs";
import { acquireSnapshotLock } from "../server/snapshot-lock.mjs";
import { createApiServer } from "../server/index.mjs";
import { deriveDashboard } from "../src/restaurant/model.mjs";
import { queryClickHouse } from "../server/clickhouse.mjs";
const f = {
  start: "2026-10-01",
  end: "2026-10-29",
  compareMode: "last-month",
  period: "month",
  regionId: "",
  province: "",
  city: "",
  storeId: "",
};
test("batch transfer profiles retain readonly execution, scan, memory and result limits", async () => {
  const original = globalThis.fetch,
    password = process.env.CLICKHOUSE_PASSWORD;
  process.env.CLICKHOUSE_PASSWORD = "test-only-not-a-real-password";
  try {
    for (const profile of ["snapshot", "member-snapshot"]) {
      globalThis.fetch = async (url) => {
        assert.equal(url.searchParams.get("readonly"), "1");
        assert.equal(url.searchParams.get("max_execution_time"), "8");
        assert.equal(url.searchParams.get("max_result_rows"), "20000");
        assert.equal(
          url.searchParams.get("max_rows_to_read"),
          profile === "snapshot" ? "1000000" : "5000000",
        );
        assert.equal(url.searchParams.get("max_bytes_to_read"), "268435456");
        return new Response('{"data":[]}');
      };
      assert.deepEqual((await queryClickHouse("SELECT 1", profile)).data, []);
    }
  } finally {
    globalThis.fetch = original;
    if (password === undefined) delete process.env.CLICKHOUSE_PASSWORD;
    else process.env.CLICKHOUSE_PASSWORD = password;
  }
});
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "restaurant-snapshot-"));
  const disposers = [];
  t.after(async () => {
    for (const dispose of disposers.reverse()) await dispose();
    await rm(directory, { recursive: true, force: true });
  });
  const generation = "snapshot-1793325600000-1234abcd.sqlite",
    path = join(directory, generation),
    db = createSnapshotDb(path);
  const metadata = {
    version: 1,
    generation,
    cycle: "2026-10-29",
    asOf: "2026-10-29",
    completedAt: "2026-10-29T02:01:00.000Z",
    firstSale: "2025-10-01",
  };
  db.prepare("INSERT INTO meta VALUES(?,?)").run(
    "snapshot",
    JSON.stringify(metadata),
  );
  insertRows(
    db,
    "stores",
    ["id", "json"],
    ["A", "B"].map((id) => [
      id,
      JSON.stringify({
        id,
        name: id,
        regionId: "N",
        regionName: "北部",
        province: "浙江",
        city: "台州",
      }),
    ]),
  );
  insertRows(
    db,
    "cohorts",
    ["store", "created", "registered", "members", "balance"],
    [
      ["A", "2026-10-02", "2026-10-02", 2, 300],
      ["B", "2025-09-10", "2026-10-03", 1, 50],
      ["", "2022-12-01", "", 1, 20],
    ],
  );
  insertRows(
    db,
    "facts",
    ["day", "store", "channel", "revenue", "orders"],
    [
      ["2026-10-01", "A", "dine-in", 100, 2],
      ["2026-10-01", "B", "delivery", 300, 3],
      ["2026-10-10", "A", "dine-in", 0, 0],
      ["2026-09-01", "A", "dine-in", 80, 1],
      ["2026-09-01", "B", "delivery", 200, 3],
      ["2025-10-01", "A", "dine-in", 120, 2],
      ["2025-10-01", "B", "delivery", 400, 4],
    ],
  );
  insertRows(
    db,
    "overview",
    ["day", "store", "revenue", "orders"],
    [
      ["2026-10-01", "A", 100, 2],
      ["2026-10-01", "B", 300, 3],
      ["2026-10-10", "A", 0, 0],
      ["2026-09-01", "A", 80, 1],
      ["2026-09-01", "B", 200, 3],
      ["2025-10-01", "A", 120, 2],
      ["2025-10-01", "B", 400, 4],
    ],
  );
  insertRows(
    db,
    "recharge",
    ["day", "store", "activity", "name", "amount", "records"],
    [
      ["2026-10-01", "A", "a", "方案", 10000, 1],
      ["2026-10-01", "B", "a", "方案", 20000, 2],
      ["2026-09-01", "A", "a", "方案", 9000, 1],
      ["2026-09-01", "B", "a", "方案", 18000, 2],
      ["2025-10-01", "A", "a", "方案", 11000, 1],
      ["2025-10-01", "B", "a", "方案", 22000, 2],
    ],
  );
  insertRows(
    db,
    "spending",
    ["day", "store", "amount"],
    [
      ["2026-10-01", "A", 1000],
      ["2026-10-02", "A", -200],
      ["2026-10-01", "B", 500],
    ],
  );
  insertRows(
    db,
    "consumption",
    ["day", "store", "customer", "receipt", "seenNew", "seenOld"],
    [
      ["2026-10-01", "A", "X", "r1", 1, 0],
      ["2026-10-02", "B", "X", "r1", 0, 1],
      ["2026-10-03", "A", "X", "r2", 0, 1],
      ["2026-10-02", "B", "Y", "r3", 0, 1],
      ["2026-10-04", "A", "Z", "", 0, 0],
      ["2026-10-05", "A", "", "r4", 0, 0],
    ],
  );
  for (const row of db
    .prepare("SELECT rowid,customer,receipt FROM consumption")
    .all())
    db.prepare("UPDATE consumption SET customer=?,receipt=? WHERE rowid=?").run(
      row.customer
        ? createHash("sha256").update(row.customer).digest("hex").toUpperCase()
        : "",
      row.receipt
        ? createHash("sha256").update(row.receipt).digest("hex").toUpperCase()
        : "",
      row.rowid,
    );
  db.close();
  await writeFile(join(directory, "current.json"), JSON.stringify(metadata));
  return { directory, path, metadata, disposers };
}
test("daily10 Shanghai boundary and restart catchup use business day rather than24h TTL", () => {
  assert.equal(dueCycle(new Date("2026-10-30T01:59:59Z")), "2026-10-29");
  assert.equal(dueCycle(new Date("2026-10-30T02:00:00Z")), "2026-10-30");
  assert.equal(
    nextRun(new Date("2026-10-30T01:59:59Z")),
    "2026-10-30T02:00:00.000Z",
  );
  assert.equal(
    nextRun(new Date("2026-10-30T02:00:00Z")),
    "2026-10-31T02:00:00.000Z",
  );
});
test("local metrics deduplicate customers/orders across days and stores, prioritize new labels, include refunds", async (t) => {
  const { path, disposers } = await fixture(t),
    r = new SnapshotReader(path);
  disposers.push(() => r.close());
  const data = r.read(f),
    m = data.members[0],
    summary = deriveDashboard(data, f);
  assert.equal(m.total, 4);
  assert.equal(m.newMembers, 2);
  assert.equal(m.registeredNewMembers, 3);
  assert.equal(m.unassignedMembers, 1);
  assert.equal(m.balance, 370);
  assert.equal(m.activeCustomers, 3);
  assert.equal(m.newCustomers, 1);
  assert.equal(m.returningCustomers, 1);
  assert.equal(m.unclassifiedCustomers, 1);
  assert.equal(m.memberVisits, 4);
  assert.equal(m.repeatNumerator, 1);
  assert.equal(m.repeatDenominator, 3);
  assert.equal(m.memberAmount, 1300);
  assert.equal(summary.current.revenue, 400);
  assert.equal(m.recharge, 30000);
  assert.equal(m.rechargePrevious, 27000);
  assert.equal(m.rechargeYear, 33000);
  assert.equal(summary.kpis[2].value, 30000);
  assert.equal(data.activities[0].reportedAmount, 30000);
  const store = r.read({ ...f, storeId: "A" }).members[0];
  assert.equal(store.total, 2);
  assert.equal(store.unassignedMembers, 0);
  assert.equal(store.activeCustomers, 2);
  assert.equal(store.memberAmount, 800);
  assert.equal(store.recharge, 10000);
  assert.equal(store.rechargePrevious, 9000);
  assert.equal(store.memberVisits, 3);
  assert.equal(
    r.read({ ...f, start: "2026-10-10", end: "2026-10-11" }).facts[0].revenue,
    0,
  );
  assert.throws(() => r.read({ ...f, end: "2026-10-30" }), /快照截至/);
  assert.equal(r.read({ ...f, storeId: "missing" }).members.length, 0);
});
test("failed daily worker preserves data; same-day polling/restart do not retry or synchronize from reads", async (t) => {
  const { directory, metadata, disposers } = await fixture(t);
  let calls = 0;
  const factory = () => {
    calls++;
    const worker = new EventEmitter();
    queueMicrotask(() => {
      worker.emit("message", { type: "failed", message: "source unavailable" });
      worker.emit("exit", 1);
    });
    return worker;
  };
  const service = new SnapshotService({
    directory,
    now: () => new Date("2026-10-30T03:00:00Z"),
    workerFactory: factory,
  });
  disposers.push(() => service.close());
  await Promise.all([service.tick(), service.tick()]);
  assert.equal(calls, 1);
  assert.equal(service.status().lastError, "source unavailable");
  assert.equal(service.read(f).members[0].total, 4);
  await service.tick();
  assert.equal(calls, 1);
  assert.equal(
    JSON.parse(await readFile(join(directory, "current.json"), "utf8"))
      .generation,
    metadata.generation,
  );
  const restarted = new SnapshotService({
    directory,
    now: () => new Date("2026-10-30T04:00:00Z"),
    workerFactory: factory,
  });
  disposers.push(() => restarted.close());
  await restarted.tick();
  assert.equal(calls, 1);
  assert.equal(restarted.read(f).members[0].total, 4);
});
test("before10 no sync, successful existing cycle skips work, and a missing snapshot read never starts worker", async (t) => {
  const { directory, disposers } = await fixture(t);
  let calls = 0;
  const service = new SnapshotService({
    directory,
    now: () => new Date("2026-10-30T01:00:00Z"),
    workerFactory: () => {
      calls++;
      throw Error("should not run");
    },
  });
  disposers.push(() => service.close());
  await service.tick();
  assert.equal(calls, 0);
  assert.equal(service.status().readMode, "local-only");
  const empty = await mkdtemp(join(tmpdir(), "restaurant-empty-"));
  t.after(() => rm(empty, { recursive: true, force: true }));
  const missing = new SnapshotService({
    directory: empty,
    workerFactory: () => {
      calls++;
    },
  });
  t.after(() => missing.close());
  assert.throws(() => missing.read(f), /尚未就绪/);
  assert.equal(calls, 0);
});
test("snapshot lock prevents overlapping source tasks", async (t) => {
  const { directory } = await fixture(t),
    release = await acquireSnapshotLock(directory);
  await assert.rejects(() => acquireSnapshotLock(directory), /已有同步任务/);
  await release();
  const again = await acquireSnapshotLock(directory);
  await again();
});
test("abrupt worker termination releases native sync lock and concurrent contenders have a single owner", async (t) => {
  const { directory } = await fixture(t),
    moduleUrl = new URL("../server/snapshot-lock.mjs", import.meta.url).href;
  const worker = new Worker(
    `const{parentPort}=require('node:worker_threads');(async()=>{const{acquireSnapshotLock}=await import(${JSON.stringify(moduleUrl)});globalThis.release=await acquireSnapshotLock(${JSON.stringify(directory)});parentPort.postMessage('locked');setInterval(()=>{},1000)})();`,
    { eval: true },
  );
  await new Promise((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
  });
  await assert.rejects(() => acquireSnapshotLock(directory), /已有同步任务/);
  await worker.terminate();
  const contenders = await Promise.allSettled([
    acquireSnapshotLock(directory),
    acquireSnapshotLock(directory),
    acquireSnapshotLock(directory),
  ]);
  assert.equal(contenders.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of contenders) if (r.status === "fulfilled") await r.value();
});
test("invalid candidate cannot replace the previously published snapshot", async (t) => {
  const { directory, path, metadata } = await fixture(t),
    before = await readFile(join(directory, "current.json"), "utf8");
  const candidate = {
    ...metadata,
    generation: "snapshot-1793325601000-abcdef98.sqlite",
  };
  await copyFile(path, join(directory, candidate.generation));
  const db = new DatabaseSync(join(directory, candidate.generation));
  db.prepare("UPDATE meta SET value=? WHERE key='snapshot'").run(
    JSON.stringify(candidate),
  );
  db.prepare("UPDATE facts SET orders=-1 WHERE store=?").run("A");
  db.close();
  await assert.rejects(
    () => publishSnapshot(directory, candidate),
    /订单不得为负数/,
  );
  assert.equal(await readFile(join(directory, "current.json"), "utf8"), before);
  const old = new SnapshotReader(path);
  try {
    assert.equal(old.read(f).members[0].total, 4);
  } finally {
    old.close();
  }
});
test("historical channel-only records remain real facts without fabricating missing overview", async (t) => {
  const { directory, path, metadata } = await fixture(t);
  const db = new DatabaseSync(path);
  db.prepare("INSERT INTO facts VALUES(?,?,?,?,?)").run(
    "2024-11-01",
    "A",
    "dine-in",
    54321,
    123,
  );
  db.close();
  await publishSnapshot(directory, metadata);
  const reader = new SnapshotReader(path);
  try {
    const range = { ...f, start: "2024-11-01", end: "2024-11-29" },
      data = reader.read(range);
    assert.equal(data.facts[0].revenue, 54321);
    assert.equal(data.overviewFacts.length, 0);
    assert.equal(deriveDashboard(data, range).current.revenue, null);
    assert.ok(data.meta.warnings.some((w) => w.includes("缺少独立门店总览")));
    assert.equal(deriveDashboard(reader.read(f), f).current.revenue, 400);
  } finally {
    reader.close();
  }
});
test("HTTP clicks and refresh remain functional with source fetch disabled and do not launch synchronization", async (t) => {
  const { directory, disposers } = await fixture(t);
  let remoteCalls = 0,
    workers = 0;
  const service = new SnapshotService({
    directory,
    workerFactory: () => {
      workers++;
      throw Error("forbidden");
    },
  });
  disposers.push(() => service.close());
  const api = createApiServer({ snapshots: service });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  disposers.push(() => {
    api.closeAllConnections();
    return new Promise((r) => api.close(r));
  });
  const saved = globalThis.fetch;
  globalThis.fetch = () => {
    remoteCalls++;
    throw Error("source blocked");
  };
  try {
    const base = "http://127.0.0.1:" + api.address().port;
    for (const scope of [
      {},
      { storeId: "A" },
      { province: "浙江" },
      { start: "2026-10-23" },
    ]) {
      const response = await saved(
        base +
          "/api/dashboard?" +
          new URLSearchParams({ source: "clickhouse", ...f, ...scope }),
      );
      assert.equal(response.status, 200);
      assert.equal(
        (await response.json()).meta.snapshot.readMode,
        "local-only",
      );
    }
    assert.equal(
      (await (await saved(base + "/api/snapshot")).json()).ready,
      true,
    );
    assert.equal(remoteCalls, 0);
    assert.equal(workers, 0);
  } finally {
    globalThis.fetch = saved;
  }
});
