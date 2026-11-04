import { queryClickHouse } from "./clickhouse.mjs";
import { loadMemberSummary } from "./member-profile.mjs";
import {
  addDays,
  comparisonRanges,
  dates,
  selectedStores,
  validateDataset,
} from "../src/restaurant/model.mjs";

// These identifiers were discovered with SHOW/DESCRIBE, not inferred from UI labels.
const brand = "连锁品牌";
const cache = new Map();
const safeId = (value) => {
  if (typeof value !== "string" || value.length > 200)
    throw Error("数据库门店编号无效");
  return "unhex('" + Buffer.from(value, "utf8").toString("hex") + "')";
};
const rows = async (sql) => (await queryClickHouse(sql)).data;
const num = (value) => Number(value);
const geoName = (value) =>
  (value || "").replace(
    /(?:壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/,
    "",
  );

export function resolveDatabaseStores(shops, explicit, regions) {
  const byId = new Map();
  for (const r of explicit) {
    if (byId.has(r.shop_id) && byId.get(r.shop_id) !== r.region)
      throw Error("数据库战区映射存在冲突：" + r.shop_id);
    byId.set(r.shop_id, r.region);
  }
  return shops.map((s) => {
    let region = byId.get(s.shopId),
      regionSource = region ? "tmp_shop_region" : "";
    if (!region) {
      const candidates = regions.filter(
        (r) =>
          geoName(r.province) === geoName(s.province) &&
          geoName(r.city) === geoName(s.city),
      );
      const district = candidates.filter(
        (r) => r.district && geoName(r.district) === geoName(s.district),
      );
      const city = candidates.filter((r) => !r.district);
      const choices = [
        ...new Set(
          (district.length ? district : city)
            .map((r) => r.region)
            .filter(Boolean),
        ),
      ];
      if (choices.length === 1) {
        region = choices[0];
        regionSource = district.length ? "t_region:district" : "t_region:city";
      }
    }
    return {
      id: s.shopId,
      name: s.shopName,
      regionId: region || "unconfirmed",
      regionName: region || "数据库战区待配置",
      province: s.province || "数据库省份缺失",
      city: s.city || "数据库城市缺失",
      status: s.status,
      regionSource,
    };
  });
}

export function databaseChannel(type, source) {
  if (type === "平台外卖" || source === "抖音外卖") return "delivery";
  if (type === "团购") return "group";
  if (["微信小程序", "支付宝小程序"].includes(source)) return "mini";
  if (type === "纯堂食" && source === "POS") return "dine-in";
  return "unmapped";
}

function chunks(start, end) {
  const result = [];
  for (let day = start; day <= end; day = addDays(day, 7))
    result.push({
      start: day,
      end: addDays(day, 6) > end ? end : addDays(day, 6),
    });
  return result;
}
const where = (column, w) =>
  `${column} >= toDate('${w.start}') AND ${column} <= toDate('${w.end}')`;
const channelSql =
  "multiIf(order_type = '平台外卖' OR order_source = '抖音外卖', 'delivery', order_type = '团购', 'group', order_source IN ('微信小程序','支付宝小程序'), 'mini', order_type = '纯堂食' AND order_source = 'POS', 'dine-in', 'unmapped')";

async function loadCore(start, end, mode, period) {
  const key = [start, end, mode, period].join("|"),
    existing = cache.get(key);
  if (existing && Date.now() - existing.created < 300000)
    return existing.promise;
  const promise = (async () => {
    const [primaryShops, extraShops, explicit, regions] = await Promise.all([
      rows(
        `SELECT shopId, shopName, province, city, district, status FROM operations.dim_shop WHERE brandName = '${brand}' LIMIT 2001`,
      ),
      rows(
        `SELECT shop_id AS shopId, shop_name AS shopName, province, city, region AS district, if(isNotNull(close_date), '已闭店', '数据库未提供营业状态') AS status FROM operations.t_store WHERE brand = '${brand}' LIMIT 2001`,
      ),
      rows("SELECT shop_id, region FROM operations.tmp_shop_region LIMIT 2001"),
      rows(
        "SELECT region, province, city, district FROM operations.t_region LIMIT 2001",
      ),
    ]);
    const primaryIds = new Set(primaryShops.map((s) => s.shopId)),
      shops = [
        ...primaryShops,
        ...extraShops.filter((s) => !primaryIds.has(s.shopId)),
      ];
    if (shops.length > 2000 || explicit.length > 2000 || regions.length > 2000)
      throw Error("数据库门店维度超出受控范围");
    const stores = resolveDatabaseStores(shops, explicit, regions),
      windows = comparisonRanges(start, end, mode, period),
      ranges = [
        { start, end },
        windows.previous,
        ...(windows.year ? [windows.year] : []),
      ],
      facts = new Map(),
      overview = new Map();
    let latestRefresh = null;
    for (const range of ranges.slice(0, 1))
      for (const w of chunks(range.start, range.end)) {
        const [channels, totals] = await Promise.all([
          rows(
            `SELECT toString(trade_date) AS date, shop_id AS storeId, ${channelSql} AS channel, toInt64(round(sum(total_income)*100)) AS revenue, sum(total_order_num) AS orders FROM operations.dws_store_sales_daily WHERE ${where("trade_date", w)} AND brand_name = '${brand}' GROUP BY date, storeId, channel LIMIT 20001`,
          ),
          rows(
            `SELECT toString(trade_date) AS date, shop_no AS storeId, toInt64(round(sum(total_income)*100)) AS revenue, sum(total_order_num) AS orders, toString(max(p_datetime)) AS refreshed FROM operations.dws_store_sales WHERE ${where("trade_date", w)} AND brand_name = '${brand}' GROUP BY date, storeId LIMIT 20001`,
          ),
        ]);
        if (channels.length > 20000 || totals.length > 20000)
          throw Error("周分片结果过大，拒绝截断");
        for (const r of channels)
          facts.set([r.date, r.storeId, r.channel].join("|"), {
            date: r.date,
            storeId: r.storeId,
            channel: r.channel,
            revenue: num(r.revenue),
            orders: r.channel === "group" ? null : num(r.orders),
          });
        for (const r of totals) {
          overview.set([r.date, r.storeId].join("|"), {
            date: r.date,
            storeId: r.storeId,
            revenue: num(r.revenue),
            orders: num(r.orders),
          });
          if (!latestRefresh || r.refreshed > latestRefresh)
            latestRefresh = r.refreshed;
        }
      }
    const comparisons = {};
    for (const [kind, range] of [
      ["previous", windows.previous],
      ...(windows.year ? [["year", windows.year]] : []),
    ]) {
      const [channelRows, totalRows] = await Promise.all([
        rows(
          `SELECT '${range.start}' AS date, shop_id AS storeId, ${channelSql} AS channel, toInt64(round(sum(total_income)*100)) AS revenue, sum(total_order_num) AS orders FROM operations.dws_store_sales_daily WHERE ${where("trade_date", range)} AND brand_name = '${brand}' GROUP BY storeId, channel LIMIT 20001`,
        ),
        rows(
          `SELECT '${range.start}' AS date, shop_no AS storeId, toInt64(round(sum(total_income)*100)) AS revenue, sum(total_order_num) AS orders FROM operations.dws_store_sales WHERE ${where("trade_date", range)} AND brand_name = '${brand}' GROUP BY storeId LIMIT 20001`,
        ),
      ]);
      if (channelRows.length > 20000 || totalRows.length > 20000)
        throw Error("基期聚合超出受控范围");
      comparisons[kind] = {
        ...range,
        facts: channelRows.map((r) => ({
          ...r,
          revenue: num(r.revenue),
          orders: r.channel === "group" ? null : num(r.orders),
        })),
        overviewFacts: totalRows.map((r) => ({
          ...r,
          revenue: num(r.revenue),
          orders: num(r.orders),
        })),
      };
    }
    const ids = new Set(stores.map((s) => s.id)),
      unmapped = [
        ...new Set(
          [...facts.values(), ...overview.values()]
            .filter((r) => !ids.has(r.storeId))
            .map((r) => r.storeId),
        ),
      ];
    if (unmapped.length)
      throw Error(
        `数据库营收包含 ${unmapped.length} 个门店维表未找到的编号，已停止而非按旧表补齐`,
      );
    // Independently reconcile both physical datasets per business day and shop.
    const check = new Map();
    for (const r of facts.values()) {
      const k = r.date + "|" + r.storeId;
      check.set(k, (check.get(k) || 0) + r.revenue);
    }
    const differences = [...overview.entries()].filter(
      ([key, r]) => check.get(key) !== r.revenue,
    );
    if (differences.length)
      throw Error(
        `数据库营收汇总与渠道明细有 ${differences.length} 个门店日不一致，拒绝混合展示`,
      );
    return {
      schemaVersion: 1,
      meta: {
        mode: "real",
        source: "ClickHouse · operations（只读）",
        title: "连锁品牌",
        revenueLabel: "总营收（门店总收入）",
        revenueDefinition:
          "operations.dws_store_sales.total_income；与 dws_store_sales_daily.total_income 逐门店日校验。原字段为门店总收入，未改称现金实收；储值不计入营业收入。",
        timezone: "Asia/Shanghai",
        generatedAt: new Date().toISOString(),
        coverage: { start: ranges.map((r) => r.start).sort()[0], end },
        coveragePolicy: "observed-records",
        warnings: [
          `门店大区、省市全部来自数据库；战区优先 tmp_shop_region，再使用 t_region 的明确市/区映射。${stores.filter((s) => s.regionId === "unconfirmed").length} 家战区尚未配置。`,
          "全部查询结果为已录入记录合计；未把无记录门店日补为0，数据库水位不等于完整性证明。",
          "四渠道互斥分组：平台/抖音外卖 > 团购 > 微信/支付宝小程序 > POS纯堂食。此展示归类已记录，业务审批口径仍待确认。",
          "团购行未提供可独立归属的有效订单计数，因此团购订单显示缺失；总订单取独立门店汇总表。",
          "翻台所需桌台使用事件、经营目标、活动成本与因果归因未配置。",
          "会员资产按首次交易门店归属，余额为当前档案快照；菜品成本口径尚未完成验证。",
        ],
        freshness: `数据库增量字段最新 ${latestRefresh || "未知"}；本地缓存最多5分钟`,
      },
      stores,
      facts: [...facts.values()],
      overviewFacts: [...overview.values()],
      comparisons,
      targets: [],
      capacity: [],
      activities: [],
      members: [],
      dishes: [],
    };
  })();
  cache.set(key, { created: Date.now(), promise });
  while (cache.size > 4) cache.delete(cache.keys().next().value);
  try {
    return await promise;
  } catch (e) {
    cache.delete(key);
    throw e;
  }
}

async function addActivities(data, start, end) {
  const ids = data.stores.map((s) => safeId(s.id)).join(",");
  if (!ids) return [];
  const result = await rows(
    `SELECT activity_id, activity_name, toString(order_date) AS date, shop_id AS storeId, toInt64(round(sum(pay_amount)*100)) AS amount, uniqExact(id) AS records, count() AS sourceRows FROM operations.t_member_card_list WHERE ${where("order_date", { start, end })} AND order_state = '正常' AND shop_id IN (${ids}) GROUP BY activity_id, activity_name, date, storeId LIMIT 20001`,
  );
  if (result.length > 20000) throw Error("活动明细超出受控范围");
  const grouped = new Map();
  for (const r of result) {
    if (num(r.records) !== num(r.sourceRows))
      throw Error("储值活动订单重复，尚未确认去重规则");
    const id = r.activity_id + ":" + r.activity_name,
      a = grouped.get(id) || {
        id,
        name: r.activity_name || "未命名储值活动",
        type: "储值活动 · 观测记录",
        start: r.date,
        end: r.date,
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
    a.start = a.start < r.date ? a.start : r.date;
    a.end = a.end > r.date ? a.end : r.date;
    if (!a.storeIds.includes(r.storeId)) a.storeIds.push(r.storeId);
    a.reportedAmount += num(r.amount);
    a.daily.push({
      date: r.date,
      storeId: r.storeId,
      reportedAmount: num(r.amount),
      reportedOrders: num(r.records),
    });
    grouped.set(id, a);
  }
  return [...grouped.values()].sort(
    (a, b) => b.reportedAmount - a.reportedAmount,
  );
}

export async function getDatabaseDashboard(filters) {
  const { start, end, compareMode, period = "month" } = filters;
  if (dates(start, end).length > 31)
    throw Error("数据库每次最多31天；服务按7天分片并控制扫描量");
  const data = structuredClone(await loadCore(start, end, compareMode, period));
  try {
    data.activities = await addActivities(data, start, end);
  } catch (e) {
    data.meta.warnings.push("活动未加载：" + e.message);
  }
  const scope = selectedStores(data, filters);
  const membership = await loadMemberSummary(filters, scope, data.stores);
  data.members = membership.member ? [membership.member] : [];
  data.meta.warnings.push(...membership.warnings);
  return validateDataset(data);
}
