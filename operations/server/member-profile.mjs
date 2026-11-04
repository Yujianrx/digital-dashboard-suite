import { queryClickHouse } from "./clickhouse.mjs";
import { addDays, comparisonRanges } from "../src/restaurant/model.mjs";
const cache = new Map();
const idList = (ids) =>
  ids
    .map((id) => "unhex('" + Buffer.from(id, "utf8").toString("hex") + "')")
    .join(",");
const period = (field, w) =>
  `${field} >= toDate('${w.start}') AND ${field} <= toDate('${w.end}')`;
const safeNumber = (value) =>
  value === undefined || value === null ? null : Number(value);

export function buildMemberQueries(filters, storeIds, national) {
  const windows = comparisonRanges(
    filters.start,
    filters.end,
    filters.compareMode,
    filters.period || "month",
  );
  const ids = idList(storeIds),
    end = addDays(filters.end, 1);
  const scope = national ? "1" : `first_shopno IN (${ids})`;
  const eligible = `create_time < toDateTime('${end} 00:00:00','Asia/Shanghai')`;
  const created = `create_time >= toDateTime('${filters.start} 00:00:00','Asia/Shanghai') AND ${eligible}`;
  const registered = `register_time >= toDateTime('${filters.start} 00:00:00','Asia/Shanghai') AND register_time < toDateTime('${end} 00:00:00','Asia/Shanghai')`;
  const cohort = `SELECT uniqExactIf(member_id,${eligible}) AS total, countIf(${eligible}) AS sourceRows, uniqExactIf(member_id,${created}) AS newMembers, uniqExactIf(member_id,${registered} AND ${eligible}) AS registeredNewMembers, toInt64(round(sumIf(usable_stored_value,${eligible})*100)) AS balance, uniqExactIf(member_id,${eligible} AND ${national ? `first_shopno NOT IN (${ids})` : "0"}) AS unassignedMembers FROM operations.t_member_detail WHERE ${scope} LIMIT 1`;
  const current = period("order_date", filters),
    previous = period("order_date", windows.previous),
    year = windows.year ? period("order_date", windows.year) : "0";
  const recharge = `SELECT toInt64(round(sumIf(pay_amount,${current})*100)) AS recharge, toInt64(round(sumIf(pay_amount,${previous})*100)) AS rechargePrevious, ${windows.year ? `toInt64(round(sumIf(pay_amount,${year})*100))` : "NULL"} AS rechargeYear FROM operations.t_member_card_list WHERE order_state='正常' AND shop_id IN (${ids}) AND ((${current}) OR (${previous}) OR (${year})) LIMIT 1`;
  const spending = `SELECT toInt64(round(-sum(total_amount)*100)) AS memberAmount, uniqExactIf(order_no,order_type='消费使用' AND order_no!='') AS memberVisits FROM operations.dws_member_card_order WHERE ${current} AND order_type IN ('消费使用','消费退款') AND shop_id IN (${ids}) LIMIT 1`;
  const customers = `SELECT count() AS activeCustomers,countIf(seenNew=1) AS newCustomers,countIf(seenNew=0 AND seenOld=1) AS returningCustomers,countIf(orders>=2) AS repeatNumerator FROM (SELECT userid,uniqExactIf(order_no,order_no!='') AS orders,max(customer_label='新客') AS seenNew,max(customer_label='老客') AS seenOld FROM operations.dws_member_card_order WHERE ${current} AND order_type='消费使用' AND userid!='' AND shop_id IN (${ids}) GROUP BY userid) LIMIT 1`;
  return { cohort, recharge, spending, customers };
}
export function memberFromAggregates(filters, storeIds, results, national) {
  const member = {
    start: filters.start,
    end: filters.end,
    storeIds: [...storeIds],
    amountLabel: "余额净消费（含退款）",
    visitsLabel: "消费使用订单数（去重）",
    balanceLabel: "当前档案储值余额",
    scopeDefinition: national
      ? "全国会员库；含尚未归属门店的会员"
      : "会员资产按首次交易门店归属；消费按实际消费门店",
    definition:
      "会员总数按当前会员库ID去重、截至结束日创建；新增会员按档案创建日，新增注册按注册日。新老客按本期储值消费会员ID去重、使用数据库新老客标签；同一会员出现两类时新客优先，缺标签单列未识别。余额为当前档案快照，非历史期末余额；储值实付单列，不并入营收。",
  };
  for (const field of [
    "total",
    "newMembers",
    "registeredNewMembers",
    "balance",
    "unassignedMembers",
  ])
    member[field] = safeNumber(results.cohort?.[field]);
  if (results.cohort && Number(results.cohort.sourceRows) !== member.total)
    member.balance = null;
  for (const field of ["recharge", "rechargePrevious", "rechargeYear"])
    member[field] = safeNumber(results.recharge?.[field]);
  for (const field of ["memberAmount", "memberVisits"])
    member[field] = safeNumber(results.spending?.[field]);
  for (const field of [
    "activeCustomers",
    "newCustomers",
    "returningCustomers",
    "repeatNumerator",
  ])
    member[field] = safeNumber(results.customers?.[field]);
  member.repeatDenominator = member.activeCustomers;
  member.unclassifiedCustomers =
    member.activeCustomers === null
      ? null
      : member.activeCustomers -
        (member.newCustomers || 0) -
        (member.returningCustomers || 0);
  return member;
}
export async function loadMemberSummary(filters, stores, allStores) {
  const ids = stores.map((s) => s.id).sort(),
    national = ids.length === allStores.length;
  const key = JSON.stringify([
    filters.start,
    filters.end,
    filters.compareMode,
    filters.period,
    ids,
  ]);
  const known = cache.get(key);
  if (known && Date.now() - known.time < 300000)
    return structuredClone(known.value);
  if (!ids.length) return { member: null, warnings: [] };
  const queries = buildMemberQueries(filters, ids, national),
    results = {},
    warnings = [];
  // The broad member master aggregation is cached and remains separately bounded.
  const cohort = await queryClickHouse(queries.cohort, "member-aggregate")
    .then((r) => r.data[0])
    .catch((e) => {
      warnings.push("会员档案聚合未加载：" + e.message);
      return null;
    });
  results.cohort = cohort;
  const keys = ["recharge", "spending", "customers"];
  const settled = await Promise.allSettled(
    keys.map((name) => queryClickHouse(queries[name])),
  );
  settled.forEach((result, index) => {
    if (result.status === "fulfilled")
      results[keys[index]] = result.value.data[0];
    else
      warnings.push(
        "会员" + keys[index] + "聚合未加载：" + result.reason.message,
      );
  });
  const value = {
    member: memberFromAggregates(filters, ids, results, national),
    warnings,
  };
  if (!warnings.length) {
    cache.set(key, { time: Date.now(), value: structuredClone(value) });
    if (cache.size > 16) cache.delete(cache.keys().next().value);
  }
  return value;
}
