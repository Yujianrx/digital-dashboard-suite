import { DatabaseSync } from "node:sqlite";
import {
  comparisonRanges,
  dates,
  selectedStores,
  validateDataset,
} from "../src/restaurant/model.mjs";
import { memberFromAggregates } from "./member-profile.mjs";
export class SnapshotReader {
  constructor(path) {
    this.db = new DatabaseSync(path, { readOnly: true });
    this.metadata = JSON.parse(
      this.db.prepare("SELECT value FROM meta WHERE key='snapshot'").get()
        .value,
    );
    this.stores = this.db
      .prepare("SELECT json FROM stores ORDER BY id")
      .all()
      .map((r) => JSON.parse(r.json));
    this.db.exec("CREATE TEMP TABLE scope(id TEXT PRIMARY KEY)");
    this.cache = new Map();
  }
  close() {
    this.db.close();
  }
  activities(start, end) {
    const groups = new Map();
    for (const r of this.db
      .prepare(
        "SELECT * FROM recharge WHERE day BETWEEN ? AND ? ORDER BY day,store,activity,name",
      )
      .all(start, end)) {
      const id = r.activity + ":" + r.name;
      const a = groups.get(id) || {
        id,
        name: r.name || "未命名储值活动",
        type: "储值活动 · 观测记录",
        start: r.day,
        end: r.day,
        storeIds: [],
        coverageLabel: "实际发生记录的门店，非计划覆盖清单",
        dateBasis: "observed-records",
        reportedLabel: "正常储值实付",
        reportedAmount: 0,
        cost: null,
        attributedMargin: null,
        attributedRevenueIncrement: null,
        daily: [],
      };
      a.end = r.day;
      if (!a.storeIds.includes(r.store)) a.storeIds.push(r.store);
      a.reportedAmount += r.amount;
      a.daily.push({
        date: r.day,
        storeId: r.store,
        reportedAmount: r.amount,
        reportedOrders: r.records,
      });
      groups.set(id, a);
    }
    return [...groups.values()].sort(
      (a, b) => b.reportedAmount - a.reportedAmount,
    );
  }
  member(f, stores) {
    if (!stores.length) return null;
    const db = this.db,
      ids = stores.map((s) => s.id),
      national = !f.regionId && !f.province && !f.city && !f.storeId;
    db.exec("DELETE FROM scope");
    const insert = db.prepare("INSERT INTO scope VALUES(?)");
    for (const id of ids) insert.run(id);
    const window = comparisonRanges(
      f.start,
      f.end,
      f.compareMode,
      f.period || "month",
    );
    const cohort = db
      .prepare(
        `SELECT coalesce(sum(members),0) AS total,coalesce(sum(members),0) AS sourceRows,
      coalesce(sum(CASE WHEN created>=? THEN members ELSE 0 END),0) AS newMembers,
      coalesce(sum(CASE WHEN registered BETWEEN ? AND ? THEN members ELSE 0 END),0) AS registeredNewMembers,
      coalesce(sum(balance),0) AS balance,
      coalesce(sum(CASE WHEN store NOT IN (SELECT id FROM stores) THEN members ELSE 0 END),0) AS unassignedMembers
      FROM cohorts WHERE created<=? ${national ? "" : "AND store IN (SELECT id FROM scope)"}`,
      )
      .get(f.start, f.start, f.end, f.end);
    const rechargeFor = (w) =>
      w
        ? db
            .prepare(
              "SELECT coalesce(sum(amount),0) AS amount FROM recharge WHERE day BETWEEN ? AND ? AND store IN (SELECT id FROM scope)",
            )
            .get(w.start, w.end).amount
        : null;
    const spending = db
      .prepare(
        "SELECT coalesce(sum(amount),0) AS memberAmount FROM spending WHERE day BETWEEN ? AND ? AND store IN (SELECT id FROM scope)",
      )
      .get(f.start, f.end);
    spending.memberVisits = db
      .prepare(
        "SELECT count(DISTINCT receipt) AS n FROM consumption WHERE day BETWEEN ? AND ? AND store IN (SELECT id FROM scope) AND receipt!=''",
      )
      .get(f.start, f.end).n;
    const customers = db
      .prepare(
        `SELECT count(*) AS activeCustomers,coalesce(sum(seenNew=1),0) AS newCustomers,
      coalesce(sum(seenNew=0 AND seenOld=1),0) AS returningCustomers,coalesce(sum(orders>=2),0) AS repeatNumerator
      FROM (SELECT customer,count(DISTINCT nullif(receipt,'')) AS orders,max(seenNew) AS seenNew,max(seenOld) AS seenOld
      FROM consumption WHERE day BETWEEN ? AND ? AND store IN (SELECT id FROM scope) AND customer!='' GROUP BY customer)`,
      )
      .get(f.start, f.end);
    const member = memberFromAggregates(
      f,
      ids,
      {
        cohort,
        recharge: {
          recharge: rechargeFor(f),
          rechargePrevious: rechargeFor(window.previous),
          rechargeYear: rechargeFor(window.year),
        },
        spending,
        customers,
      },
      national,
    );
    member.balanceLabel = "同步时档案储值余额";
    member.definition +=
      " 本页由每日10点本地快照计算，余额是同步时的档案快照。";
    return member;
  }
  read(filters) {
    const f = { ...filters, period: filters.period || "month" };
    if (dates(f.start, f.end).length > 31) throw Error("本地看板每次最多31天");
    if (f.end > this.metadata.asOf)
      throw Error(
        "本地快照截至" +
          this.metadata.asOf +
          "，请选择已同步日期；每天10:00更新",
      );
    const key = JSON.stringify([f.start, f.end, f.compareMode, f.period]);
    let base = this.cache.get(key);
    if (!base) {
      const { db } = this,
        windows = comparisonRanges(f.start, f.end, f.compareMode, f.period),
        comparisons = {};
      for (const [kind, w] of [
        ["previous", windows.previous],
        ["year", windows.year],
      ])
        if (w) {
          comparisons[kind] = {
            ...w,
            facts: db
              .prepare(
                "SELECT ? AS date,store AS storeId,channel,sum(revenue) AS revenue,CASE WHEN channel='group' THEN NULL ELSE sum(orders) END AS orders FROM facts WHERE day BETWEEN ? AND ? GROUP BY store,channel",
              )
              .all(w.start, w.start, w.end),
            overviewFacts: db
              .prepare(
                "SELECT ? AS date,store AS storeId,sum(revenue) AS revenue,sum(orders) AS orders FROM overview WHERE day BETWEEN ? AND ? GROUP BY store",
              )
              .all(w.start, w.start, w.end),
          };
        }
      base = {
        schemaVersion: 1,
        meta: {
          mode: "real",
          source: "ClickHouse真实数据 · 本地每日快照",
          title: "连锁品牌",
          revenueLabel: "总营收（门店总收入）",
          revenueDefinition:
            "operations.dws_store_sales.total_income；两表同时存在的门店日已核对；缺失总览不以渠道合计补齐。储值实付单列，不并入营业收入。",
          timezone: "Asia/Shanghai",
          generatedAt: this.metadata.completedAt,
          coverage: {
            start: [f.start, windows.previous.start, windows.year?.start]
              .filter(Boolean)
              .sort()[0],
            end: f.end,
          },
          coveragePolicy: "observed-records",
          warnings: [
            `门店大区与省市均来自数据库；${this.stores.filter((s) => s.regionId === "unconfirmed").length}家战区待配置。`,
            "本页只查询本地真实快照，未把无记录门店日补0。",
            "渠道优先级：平台/抖音外卖 > 团购 > 微信/支付宝小程序 > POS纯堂食；团购独立有效订单缺失。",
            "会员资产按首次交易门店归属，消费按实际门店；余额为同步时档案快照，非历史期末余额。",
            "经营目标、活动成本与因果归因、菜品成本尚未完成验证。",
          ],
          freshness: `快照截至${this.metadata.asOf}；每天10:00同步；源增量字段${this.metadata.latestSource || "未知"}`,
          snapshot: this.metadata,
        },
        stores: this.stores,
        facts: db
          .prepare(
            "SELECT day AS date,store AS storeId,channel,revenue,orders FROM facts WHERE day BETWEEN ? AND ? ORDER BY day,store,channel",
          )
          .all(f.start, f.end),
        overviewFacts: db
          .prepare(
            "SELECT day AS date,store AS storeId,revenue,orders FROM overview WHERE day BETWEEN ? AND ? ORDER BY day,store",
          )
          .all(f.start, f.end),
        comparisons,
        targets: [],
        capacity: [],
        activities: this.activities(f.start, f.end),
        dishes: [],
      };
      const ranges = [f, windows.previous, windows.year].filter(Boolean);
      const orphaned = db
        .prepare(
          `SELECT count(*) AS n FROM facts f LEFT JOIN overview o USING(day,store) WHERE o.day IS NULL AND (${ranges.map(() => "(f.day BETWEEN ? AND ?)").join(" OR ")})`,
        )
        .get(...ranges.flatMap((w) => [w.start, w.end])).n;
      if (orphaned)
        base.meta.warnings.push(
          "本次或比较区间的部分历史渠道记录缺少独立门店总览；渠道数据保留，总营收未用渠道合计补齐。",
        );
      this.cache.set(key, base);
      if (this.cache.size > 4)
        this.cache.delete(this.cache.keys().next().value);
    }
    const m = this.member(f, selectedStores(base, f));
    return validateDataset({
      ...base,
      meta: { ...base.meta, warnings: [...base.meta.warnings] },
      members: m ? [m] : [],
    });
  }
}
