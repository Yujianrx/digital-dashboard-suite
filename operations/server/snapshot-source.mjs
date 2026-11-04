import { mkdir, readFile, writeFile, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { queryClickHouse } from "./clickhouse.mjs";
import { resolveDatabaseStores } from "./database-profile.mjs";
import { createSnapshotDb, insertRows } from "./snapshot-schema.mjs";
import { addDays, shanghaiToday } from "../src/restaurant/model.mjs";
import { acquireSnapshotLock } from "./snapshot-lock.mjs";
import { publishSnapshot } from "./snapshot-publish.mjs";
const N = (v) => (v === null || v === undefined ? null : Number(v));
const money = "toInt64(round(sum(pay_amount)*100))";
const channel =
  "multiIf(order_type = '平台外卖' OR order_source = '抖音外卖', 'delivery', order_type = '团购', 'group', order_source IN ('微信小程序','支付宝小程序'), 'mini', order_type = '纯堂食' AND order_source = 'POS', 'dine-in', 'unmapped')";
const dateWhere = (column, start, end) =>
  `${column}>=toDate('${start}') AND ${column}<=toDate('${end}')`;
const sourceRows = async (sql, profile) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return (
        await queryClickHouse(
          sql,
          profile === "member-aggregate" ? "member-snapshot" : "snapshot",
        )
      ).data;
    } catch (e) {
      if (attempt || !/(连接失败|响应读取失败)/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
};
async function pages(query, consume, profile, pageSize = 20000) {
  for (let offset = 0; ; offset += pageSize) {
    const rows = await sourceRows(
      query + ` LIMIT ${pageSize} OFFSET ${offset}`,
      profile,
    );
    await consume(rows);
    if (rows.length < pageSize) break;
  }
}
async function parallelWindows(items, consume) {
  let cursor = 0,
    failed = false;
  const result = await Promise.allSettled(
    [0, 1].map(async () => {
      while (!failed && cursor < items.length) {
        const item = items[cursor++];
        try {
          await consume(item);
        } catch (e) {
          failed = true;
          throw e;
        }
      }
    }),
  );
  const failure = result.find((r) => r.status === "rejected");
  if (failure) throw failure.reason;
}
function chunks(start, end, size) {
  const result = [];
  for (let day = start; day <= end; day = addDays(day, size))
    result.push([
      day,
      addDays(day, size - 1) > end ? end : addDays(day, size - 1),
    ]);
  return result;
}
function months(start, end) {
  const result = [];
  for (let day = start; day <= end;) {
    const next = new Date(day + "T00:00:00Z");
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    const last = addDays(next.toISOString().slice(0, 10), -1);
    result.push([day, last > end ? end : last]);
    day = addDays(last, 1);
  }
  return result;
}
async function masterControl() {
  return (
    await sourceRows(
      "SELECT count() AS rows,uniqExact(member_id) AS ids,toInt64(round(sum(usable_stored_value)*100)) AS balance FROM operations.t_member_detail LIMIT 1",
      "member-aggregate",
    )
  )[0];
}
export async function buildSnapshot(options) {
  await mkdir(options.directory, { recursive: true });
  const release = await acquireSnapshotLock(options.directory);
  try {
    let current;
    try {
      current = JSON.parse(
        await readFile(join(options.directory, "current.json"), "utf8"),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    for (const name of await readdir(options.directory)) {
      if (
        /^snapshot-\d{13}-[a-f0-9]{8}\.sqlite$/.test(name) &&
        name !== current?.generation &&
        name !== current?.previousGeneration
      ) {
        await unlink(join(options.directory, name)).catch(() => {});
        await unlink(join(options.directory, name + ".failed.json")).catch(
          () => {},
        );
      }
    }
    return await buildUnlocked(options);
  } finally {
    await release();
  }
}
async function buildUnlocked({
  directory,
  cycle,
  now = new Date(),
  progress = () => {},
}) {
  await mkdir(directory, { recursive: true });
  const generation =
      "snapshot-" +
      Date.now() +
      "-" +
      randomBytes(4).toString("hex") +
      ".sqlite",
    path = join(directory, generation);
  const asOf = addDays(shanghaiToday(now), -1);
  let db,
    published = false;
  try {
    progress("读取数据库门店与分区");
    const [primary, extra, explicit, regions, parts] = await Promise.all([
      sourceRows(
        "SELECT shopId,shopName,province,city,district,status FROM operations.dim_shop WHERE brandName='连锁品牌' LIMIT 2001",
      ),
      sourceRows(
        "SELECT shop_id AS shopId,shop_name AS shopName,province,city,region AS district,if(isNotNull(close_date),'已闭店','数据库未提供营业状态') AS status FROM operations.t_store WHERE brand='连锁品牌' LIMIT 2001",
      ),
      sourceRows(
        "SELECT shop_id,region FROM operations.tmp_shop_region LIMIT 2001",
      ),
      sourceRows(
        "SELECT region,province,city,district FROM operations.t_region LIMIT 2001",
      ),
      sourceRows(
        "SELECT table,min(partition) AS first FROM system.parts WHERE database='operations' AND active AND table IN ('dws_store_sales','dws_store_sales_daily','dws_member_card_order') GROUP BY table LIMIT 10",
      ),
    ]);
    if ([primary, extra, explicit, regions].some((r) => r.length > 2000))
      throw Error("门店维度超过同步限制");
    const known = new Set(primary.map((s) => s.shopId));
    const stores = resolveDatabaseStores(
      [...primary, ...extra.filter((s) => !known.has(s.shopId))],
      explicit,
      regions,
    );
    const storeIds = new Set(stores.map((s) => s.id));
    if (!stores.length) throw Error("数据库门店目录为空，保留旧快照");
    const earliest = (table) => {
      const p = parts.find((p) => p.table === table)?.first;
      if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(p || ""))
        throw Error("无法确认历史分区：" + table);
      return p.slice(0, 4) + "-" + p.slice(4) + "-01";
    };
    const firstSale = [
      earliest("dws_store_sales"),
      earliest("dws_store_sales_daily"),
    ].sort()[0];
    db = createSnapshotDb(path);
    insertRows(
      db,
      "stores",
      ["id", "json"],
      stores.map((s) => [s.id, JSON.stringify(s)]),
    );
    const periods = chunks(firstSale, asOf, 7);
    let i = 0;
    await parallelWindows(periods, async ([start, end]) => {
      progress(`同步历史营收 ${++i}/${periods.length}（${start}）`);
      const [facts, totals] = await Promise.all([
        sourceRows(
          `SELECT toString(trade_date) AS day,shop_id AS store,${channel} AS channel,toInt64(round(sum(total_income)*100)) AS revenue,sum(total_order_num) AS orders FROM operations.dws_store_sales_daily WHERE ${dateWhere("trade_date", start, end)} AND brand_name='连锁品牌' GROUP BY day,store,channel LIMIT 20001`,
        ),
        sourceRows(
          `SELECT toString(trade_date) AS day,shop_no AS store,toInt64(round(sum(total_income)*100)) AS revenue,sum(total_order_num) AS orders,toString(max(p_datetime)) AS refreshed FROM operations.dws_store_sales WHERE ${dateWhere("trade_date", start, end)} AND brand_name='连锁品牌' GROUP BY day,store LIMIT 20001`,
        ),
      ]);
      insertRows(
        db,
        "facts",
        ["day", "store", "channel", "revenue", "orders"],
        facts.map((r) => [
          r.day,
          r.store,
          r.channel,
          N(r.revenue),
          r.channel === "group" ? null : N(r.orders),
        ]),
      );
      insertRows(
        db,
        "overview",
        ["day", "store", "revenue", "orders", "refreshed"],
        totals.map((r) => [
          r.day,
          r.store,
          N(r.revenue),
          N(r.orders),
          r.refreshed,
        ]),
      );
    });
    progress("同步储值活动与实付");
    await pages(
      `SELECT toString(order_date) AS day,shop_id AS store,activity_id AS activity,activity_name AS name,${money} AS amount,uniqExact(id) AS records,count() AS sourceRows FROM operations.t_member_card_list WHERE order_date<=toDate('${asOf}') AND order_state='正常' GROUP BY day,store,activity,name ORDER BY day,store,activity,name`,
      (rows) => {
        if (rows.some((r) => N(r.records) !== N(r.sourceRows)))
          throw Error("储值活动订单有重复，保留旧快照");
        insertRows(
          db,
          "recharge",
          ["day", "store", "activity", "name", "amount", "records"],
          rows
            .filter((r) => storeIds.has(r.store))
            .map((r) => [
              r.day,
              r.store,
              r.activity,
              r.name || "",
              N(r.amount),
              N(r.records),
            ]),
        );
      },
    );
    let salt;
    try {
      salt = (await readFile(join(directory, "identity-salt"), "utf8")).trim();
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      salt = randomBytes(32).toString("hex");
      await writeFile(join(directory, "identity-salt"), salt, { flag: "wx" });
    }
    if (!/^[a-f0-9]{64}$/.test(salt)) throw Error("本地去重密钥无效");
    const token = (column, domain) =>
      `if(${column}='','',hex(SHA256(concat(unhex('${salt}'),'${domain}:',${column}))))`;
    const memberPeriods = months(earliest("dws_member_card_order"), asOf);
    i = 0;
    await parallelWindows(memberPeriods, async ([start, end]) => {
      progress(`同步会员消费 ${++i}/${memberPeriods.length}（${start}）`);
      await pages(
        `SELECT toString(order_date) AS day,shop_id AS store,${token("userid", "customer")} AS customer,${token("order_no", "receipt")} AS receipt,max(customer_label='新客') AS seenNew,max(customer_label='老客') AS seenOld FROM operations.dws_member_card_order WHERE ${dateWhere("order_date", start, end)} AND order_type='消费使用' GROUP BY day,store,customer,receipt ORDER BY day,store,customer,receipt`,
        (rows) =>
          insertRows(
            db,
            "consumption",
            ["day", "store", "customer", "receipt", "seenNew", "seenOld"],
            rows
              .filter((r) => storeIds.has(r.store))
              .map((r) => [
                r.day,
                r.store,
                r.customer,
                r.receipt,
                N(r.seenNew),
                N(r.seenOld),
              ]),
          ),
        undefined,
        10000,
      );
      await pages(
        `SELECT toString(order_date) AS day,shop_id AS store,toInt64(round(-sum(total_amount)*100)) AS amount FROM operations.dws_member_card_order WHERE ${dateWhere("order_date", start, end)} AND order_type IN ('消费使用','消费退款') GROUP BY day,store ORDER BY day,store`,
        (rows) =>
          insertRows(
            db,
            "spending",
            ["day", "store", "amount"],
            rows
              .filter((r) => storeIds.has(r.store))
              .map((r) => [r.day, r.store, N(r.amount)]),
          ),
      );
    });
    progress("校验会员唯一性");
    const before = await masterControl();
    if (N(before.rows) !== N(before.ids))
      throw Error("会员档案ID不唯一，无法安全发布本地汇总");
    let cohortRows = 0;
    await pages(
      "SELECT first_shopno AS store,toString(toDate(create_time,'Asia/Shanghai')) AS created,toString(toDate(register_time,'Asia/Shanghai')) AS registered,count() AS members,toInt64(round(sum(usable_stored_value)*100)) AS balance FROM operations.t_member_detail GROUP BY store,created,registered ORDER BY store,created,registered NULLS FIRST",
      (rows) => {
        insertRows(
          db,
          "cohorts",
          ["store", "created", "registered", "members", "balance"],
          rows.map((r) => [
            r.store,
            r.created,
            r.registered || "",
            N(r.members),
            N(r.balance),
          ]),
        );
        cohortRows += rows.length;
        progress(`同步会员资产分组 ${cohortRows.toLocaleString("en-US")}`);
      },
      "member-aggregate",
    );
    const after = await masterControl(),
      local = db
        .prepare(
          "SELECT sum(members) AS rows,sum(balance) AS balance FROM cohorts",
        )
        .get();
    if (
      JSON.stringify(before) !== JSON.stringify(after) ||
      N(local.rows) !== N(before.rows) ||
      N(local.balance) !== N(before.balance)
    )
      throw Error("同步期间会员控制数发生变化，保留旧快照");
    progress("校验逐门店日营收与本地完整性");
    const mismatch = db
      .prepare(
        "SELECT count(*) AS n FROM overview o LEFT JOIN (SELECT day,store,sum(revenue) AS revenue FROM facts GROUP BY day,store) f USING(day,store) WHERE f.revenue IS NULL OR o.revenue!=f.revenue",
      )
      .get().n;
    const extraFacts = db
      .prepare(
        "SELECT count(*) AS n FROM facts f LEFT JOIN overview o USING(day,store) WHERE o.day IS NULL",
      )
      .get().n;
    const unmapped = db
      .prepare(
        "SELECT count(*) AS n FROM (SELECT store FROM facts UNION SELECT store FROM overview) d LEFT JOIN stores s ON d.store=s.id WHERE s.id IS NULL",
      )
      .get().n;
    if (mismatch || unmapped)
      throw Error("营收对账或门店映射未通过，保留旧快照");
    const metadata = {
      version: 1,
      generation,
      cycle,
      asOf,
      firstSale,
      completedAt: new Date().toISOString(),
      memberSourceRows: N(before.rows),
      cohortGroups: cohortRows,
      channelOnlyRecords: extraFacts,
      latestSource: db
        .prepare("SELECT max(refreshed) AS latest FROM overview")
        .get().latest,
    };
    db.prepare("INSERT INTO meta VALUES(?,?)").run(
      "snapshot",
      JSON.stringify(metadata),
    );
    db.close();
    db = null;
    await publishSnapshot(directory, metadata);
    published = true;
    try {
      progress("同步完成");
    } catch {}
    return metadata;
  } catch (e) {
    if (db) db.close();
    if (!published)
      await writeFile(
        path + ".failed.json",
        JSON.stringify({ asOf, cycle, message: e.message }),
      ).catch(() => {});
    throw e;
  }
}
