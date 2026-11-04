export const DAY = 86400000;
export const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
export function sum(values) {
  const known = values.filter(isNumber);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}
export function ratio(a, b) {
  return isNumber(a) && isNumber(b) && b > 0 ? a / b : null;
}
export function change(current, base) {
  return isNumber(current) && isNumber(base) && base > 0
    ? current / base - 1
    : null;
}
export function validDate(s) {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export function addDays(s, n) {
  return new Date(Date.parse(s + "T00:00:00Z") + n * DAY)
    .toISOString()
    .slice(0, 10);
}
export function dates(start, end) {
  if (
    !validDate(start) ||
    !validDate(end) ||
    start > end ||
    (Date.parse(end) - Date.parse(start)) / DAY > 365
  )
    throw Error("日期范围必须有效且不超过366天");
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
export function shanghaiToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function defaults(now = new Date()) {
  const end = addDays(shanghaiToday(now), -1);
  return {
    start: end.slice(0, 7) + "-01",
    end,
    compareMode: "last-month",
    period: "month",
    regionId: "",
    province: "",
    city: "",
    storeId: "",
  };
}
function shiftedMonth(s) {
  const d = new Date(s + "T00:00:00Z"),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
function shiftedYear(s) {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(5, 10) === s.slice(5)
    ? d.toISOString().slice(0, 10)
    : null;
}
export function comparisonRanges(
  start,
  end,
  mode = "last-month",
  period = "month",
) {
  const n = dates(start, end).length;
  const previous =
    mode === "previous-period"
      ? { start: addDays(start, -n), end: addDays(start, -1) }
      : {
          start: shiftedMonth(start),
          end:
            period === "range"
              ? addDays(shiftedMonth(start), n - 1)
              : shiftedMonth(end),
        };
  const ys = shiftedYear(start),
    ye = shiftedYear(end);
  return { previous, year: ys && ye ? { start: ys, end: ye } : null };
}
export function selectedStores(data, f) {
  return data.stores.filter(
    (s) =>
      (!f.regionId || s.regionId === f.regionId) &&
      (!f.province || s.province === f.province) &&
      (!f.city || s.city === f.city) &&
      (!f.storeId || s.id === f.storeId),
  );
}
function inRange(r, w) {
  return !!w && r.date >= w.start && r.date <= w.end;
}
function totals(rows) {
  const revenue = sum(rows.map((r) => r.revenue)),
    orders = sum(rows.map((r) => r.orders));
  const complete =
    rows.length > 0 &&
    rows.every((r) => isNumber(r.revenue) && isNumber(r.orders));
  return {
    revenue,
    orders,
    ticket: complete ? ratio(revenue, orders) : null,
    partial: rows.some((r) => !isNumber(r.revenue) || !isNumber(r.orders)),
  };
}
export function classify(raw, mapping) {
  return Object.hasOwn(mapping, raw) ? mapping[raw] : "unmapped";
}
export function validateDataset(d) {
  if (
    !d ||
    d.schemaVersion !== 1 ||
    !d.meta ||
    !["demo", "real"].includes(d.meta.mode) ||
    d.meta.timezone !== "Asia/Shanghai"
  )
    throw Error("数据包版本/模式/时区无效");
  for (const key of [
    "stores",
    "facts",
    "targets",
    "capacity",
    "activities",
    "members",
    "dishes",
  ])
    if (!Array.isArray(d[key])) throw Error("数据包缺少数组 " + key);
  if (
    !d.meta.coverage ||
    !validDate(d.meta.coverage.start) ||
    !validDate(d.meta.coverage.end) ||
    d.meta.coverage.start > d.meta.coverage.end
  )
    throw Error("覆盖日期无效");
  if (
    !Array.isArray(d.meta.warnings) ||
    !d.meta.source ||
    !d.meta.revenueDefinition ||
    !d.meta.revenueLabel
  )
    throw Error("数据包必须声明来源和指标定义");
  const ids = new Set();
  for (const s of d.stores) {
    if (
      !s.id ||
      ids.has(s.id) ||
      !s.name ||
      !s.regionId ||
      !s.province ||
      !s.city
    )
      throw Error("门店ID重复或层级字段缺失");
    ids.add(s.id);
  }
  const unique = new Set();
  for (const r of d.facts) {
    const key = [r.date, r.storeId, r.channel].join("|");
    if (
      !validDate(r.date) ||
      !ids.has(r.storeId) ||
      !["dine-in", "delivery", "group", "mini", "unmapped"].includes(
        r.channel,
      ) ||
      unique.has(key)
    )
      throw Error("营业明细日期/门店/渠道/粒度重复无效");
    unique.add(key);
    for (const k of ["revenue", "orders"])
      if (r[k] !== null && (!isNumber(r[k]) || !Number.isSafeInteger(r[k])))
        throw Error("金额按整数分、订单按整数或null传入");
    if (isNumber(r.orders) && r.orders < 0) throw Error("有效订单不得为负数");
  }
  for (const key of ["targets", "capacity", "dishes"]) {
    const seen = new Set();
    for (const r of d[key]) {
      const rowKey = [
        r.date,
        r.storeId,
        ...(key === "dishes" ? [r.id] : []),
      ].join("|");
      if (!validDate(r.date) || !ids.has(r.storeId) || seen.has(rowKey))
        throw Error(key + "日期/门店/粒度重复无效");
      seen.add(rowKey);
      if (key === "dishes" && (!r.id || !r.name))
        throw Error("菜品ID和名称不能为空");
      for (const [k, v] of Object.entries(r))
        if (
          [
            "revenue",
            "orders",
            "cost",
            "quantity",
            "tableUses",
            "availableTables",
          ].includes(k) &&
          v !== null &&
          (!isNumber(v) || !Number.isSafeInteger(v))
        )
          throw Error(key + "数值无效");
    }
  }
  for (const a of d.activities) {
    if (
      !a.id ||
      !a.name ||
      !validDate(a.start) ||
      !validDate(a.end) ||
      a.start > a.end ||
      !Array.isArray(a.storeIds) ||
      !Array.isArray(a.daily) ||
      a.storeIds.some((id) => !ids.has(id)) ||
      new Set(a.storeIds).size !== a.storeIds.length
    )
      throw Error("活动窗口/覆盖门店无效");
    for (const r of a.daily) {
      if (!validDate(r.date) || !a.storeIds.includes(r.storeId))
        throw Error("活动日明细范围无效");
      for (const k of ["issued", "redeemed", "orders", "revenue"])
        if (r[k] != null && (!isNumber(r[k]) || !Number.isSafeInteger(r[k])))
          throw Error("活动数值无效");
    }
  }
  for (const m of d.members) {
    if (
      !validDate(m.start) ||
      !validDate(m.end) ||
      m.start > m.end ||
      !Array.isArray(m.storeIds) ||
      m.storeIds.some((id) => !ids.has(id)) ||
      new Set(m.storeIds).size !== m.storeIds.length
    )
      throw Error("会员汇总范围无效");
    for (const k of [
      "total",
      "newCustomers",
      "returningCustomers",
      "repeatNumerator",
      "repeatDenominator",
      "balance",
      "newMembers",
      "memberAmount",
      "memberVisits",
      "recharge",
      "rechargePrevious",
      "rechargeYear",
      "registeredNewMembers",
      "activeCustomers",
      "unclassifiedCustomers",
      "unassignedMembers",
    ])
      if (m[k] != null && (!isNumber(m[k]) || !Number.isSafeInteger(m[k])))
        throw Error("会员数值无效");
  }
  if (d.overviewFacts) {
    const seen = new Set();
    for (const r of d.overviewFacts) {
      const key = r.date + "|" + r.storeId;
      if (!validDate(r.date) || !ids.has(r.storeId) || seen.has(key))
        throw Error("总览门店日粒度无效");
      seen.add(key);
      for (const k of ["revenue", "orders"])
        if (r[k] !== null && (!isNumber(r[k]) || !Number.isSafeInteger(r[k])))
          throw Error("总览数值无效");
    }
  }
  if (d.comparisons)
    for (const bundle of Object.values(d.comparisons)) {
      if (
        !validDate(bundle.start) ||
        !validDate(bundle.end) ||
        bundle.start > bundle.end ||
        !Array.isArray(bundle.facts) ||
        !Array.isArray(bundle.overviewFacts)
      )
        throw Error("基期结构无效");
      validateDataset({
        ...d,
        facts: bundle.facts,
        overviewFacts: bundle.overviewFacts,
        comparisons: undefined,
      });
    }
  return d;
}
export function deriveDashboard(data, f) {
  const windows = comparisonRanges(
      f.start,
      f.end,
      f.compareMode,
      f.period || "month",
    ),
    stores = selectedStores(data, f),
    ids = new Set(stores.map((s) => s.id));
  const scoped = data.facts.filter((r) => ids.has(r.storeId)),
    rows = scoped.filter((r) => inRange(r, f));
  const overviewScoped = (data.overviewFacts || data.facts).filter((r) =>
      ids.has(r.storeId),
    ),
    overviewRows = overviewScoped.filter((r) => inRange(r, f));
  const baseline = (kind, field, window) => {
    const bundle = data.comparisons?.[kind];
    if (
      bundle &&
      window &&
      bundle.start === window.start &&
      bundle.end === window.end
    )
      return bundle[field].filter((r) => ids.has(r.storeId));
    return (field === "facts" ? scoped : overviewScoped).filter((r) =>
      inRange(r, window),
    );
  };
  const previousFacts = baseline("previous", "facts", windows.previous),
    previousOverview = baseline("previous", "overviewFacts", windows.previous),
    yearOverview = baseline("year", "overviewFacts", windows.year);
  const completeWindow = (rr, w) => {
    const t = totals(rr);
    const expected = data.meta.expectedChannels || [
      ...new Set(data.facts.map((r) => r.channel)),
    ];
    const count = w
      ? stores.length * dates(w.start, w.end).length * expected.length
      : 0;
    t.partial =
      t.partial ||
      (data.meta.coveragePolicy !== "observed-records" &&
        !!count &&
        rr.length !== count);
    if (t.partial) t.ticket = null;
    return t;
  };
  const current = completeWindow(overviewRows, f),
    previous = completeWindow(previousOverview, windows.previous),
    year = completeWindow(yearOverview, windows.year);
  const comparableChange = (
    a,
    b,
    partialA = current.partial,
    partialB = previous.partial,
  ) => (!partialA && !partialB ? change(a, b) : null);
  const capacity = data.capacity.filter(
    (r) => ids.has(r.storeId) && inRange(r, f),
  );
  const turnover =
    capacity.length === stores.length * dates(f.start, f.end).length &&
    capacity.length &&
    capacity.every((r) => isNumber(r.tableUses) && isNumber(r.availableTables))
      ? ratio(
          sum(capacity.map((r) => r.tableUses)),
          sum(capacity.map((r) => r.availableTables)),
        )
      : null;
  const capTotal = (w) => {
    const rr = data.capacity.filter((r) => ids.has(r.storeId) && inRange(r, w));
    return w &&
      rr.length === stores.length * dates(w.start, w.end).length &&
      rr.length &&
      rr.every((r) => isNumber(r.tableUses) && isNumber(r.availableTables))
      ? ratio(
          sum(rr.map((r) => r.tableUses)),
          sum(rr.map((r) => r.availableTables)),
        )
      : null;
  };
  const targets = data.targets.filter(
    (r) => ids.has(r.storeId) && inRange(r, f),
  );
  // Targets must cover every store/day represented by the selected period.
  const expected = stores.length * dates(f.start, f.end).length;
  const target = (k) =>
    targets.length === expected && targets.every((r) => isNumber(r[k]))
      ? sum(targets.map((r) => r[k]))
      : null;
  const channels = ["dine-in", "delivery", "group", "mini", "unmapped"].map(
    (id) => {
      const rr = rows.filter((r) => r.channel === id),
        p = totals(previousFacts.filter((r) => r.channel === id)),
        t = totals(rr);
      return {
        id,
        ...t,
        share: !current.partial ? ratio(t.revenue, current.revenue) : null,
        mom: comparableChange(t.revenue, p.revenue),
      };
    },
  );
  const trend = dates(f.start, f.end).map((date) => ({
    date,
    ...totals(overviewRows.filter((r) => r.date === date)),
    channels: Object.fromEntries(
      channels.map((c) => [
        c.id,
        sum(
          rows
            .filter((r) => r.date === date && r.channel === c.id)
            .map((r) => r.revenue),
        ),
      ]),
    ),
  }));
  const indexStoreRows = (rows) => {
    const index = new Map();
    for (const row of rows) {
      if (!index.has(row.storeId)) index.set(row.storeId, []);
      index.get(row.storeId).push(row);
    }
    return index;
  };
  const currentByStore = indexStoreRows(overviewRows),
    previousByStore = indexStoreRows(previousOverview);
  const ranking = stores
    .map((s) => {
      const t = totals(currentByStore.get(s.id) || []);
      return {
        ...s,
        ...t,
        mom: comparableChange(
          t.revenue,
          totals(previousByStore.get(s.id) || []).revenue,
        ),
      };
    })
    .sort((a, b) => (b.revenue ?? -Infinity) - (a.revenue ?? -Infinity));
  const activities = data.activities
    .filter(
      (a) =>
        a.start <= f.end &&
        a.end >= f.start &&
        (!a.storeIds.length
          ? stores.length === data.stores.length
          : a.storeIds.some((id) => ids.has(id))),
    )
    .map((a) => {
      const covered = new Set(a.storeIds.filter((id) => ids.has(id))),
        dr = a.daily.filter((r) => covered.has(r.storeId) && inRange(r, f));
      const fullScope =
        covered.size === a.storeIds.length &&
        a.storeIds.length > 0 &&
        f.start <= a.start &&
        f.end >= a.end;
      const issued = sum(dr.map((r) => r.issued)),
        redeemed = sum(dr.map((r) => r.redeemed));
      const window = {
        start: a.start > f.start ? a.start : f.start,
        end: a.end < f.end ? a.end : f.end,
      };
      const observed = totals(
        overviewScoped.filter(
          (r) => covered.has(r.storeId) && inRange(r, window),
        ),
      );
      const prior = {
        start: addDays(window.start, -dates(window.start, window.end).length),
        end: addDays(window.start, -1),
      };
      const before = totals(
        overviewScoped.filter(
          (r) => covered.has(r.storeId) && inRange(r, prior),
        ),
      );
      const method = !!a.attributionMethod;
      const phases = [
        {
          label: "活动前7日",
          start: addDays(a.start, -7),
          end: addDays(a.start, -1),
        },
        { label: "活动期间", start: a.start, end: a.end },
        {
          label: "活动后7日",
          start: addDays(a.end, 1),
          end: addDays(a.end, 7),
        },
      ].map((w) => ({
        ...w,
        ...totals(
          overviewScoped.filter((r) => covered.has(r.storeId) && inRange(r, w)),
        ),
      }));
      return {
        ...a,
        coveredStores: covered.size,
        reportedAmount: sum(dr.map((r) => r.reportedAmount)),
        reportedOrders: sum(dr.map((r) => r.reportedOrders)),
        reportedTrend: dates(f.start, f.end).map((date) => ({
          date,
          revenue: sum(
            dr.filter((r) => r.date === date).map((r) => r.reportedAmount),
          ),
        })),
        issued,
        redeemed,
        redemption:
          dr.length &&
          dr.every((r) => isNumber(r.issued) && isNumber(r.redeemed))
            ? ratio(redeemed, issued)
            : null,
        observedRevenue: observed.revenue,
        orders: observed.orders,
        mom: change(observed.revenue, before.revenue),
        increment:
          method && fullScope ? (a.attributedRevenueIncrement ?? null) : null,
        roi: method && fullScope ? ratio(a.attributedMargin, a.cost) : null,
        phases,
      };
    });
  const member =
    data.members.find(
      (m) =>
        m.start === f.start &&
        m.end === f.end &&
        m.storeIds.length === ids.size &&
        m.storeIds.every((id) => ids.has(id)),
    ) ?? null;
  const dishRows = data.dishes.filter(
      (r) => ids.has(r.storeId) && inRange(r, f),
    ),
    dishIds = [...new Set(dishRows.map((d) => d.id))];
  const dishes = dishIds
    .map((id) => {
      const rr = dishRows.filter((r) => r.id === id),
        eligible = rr.filter(
          (r) => isNumber(r.cost) && r.cost > 0 && isNumber(r.revenue),
        );
      const revenue = sum(eligible.map((r) => r.revenue)),
        cost = sum(eligible.map((r) => r.cost));
      return {
        id,
        name: rr[0].name,
        quantity: sum(rr.map((r) => r.quantity)),
        revenue: sum(rr.map((r) => r.revenue)),
        margin: isNumber(revenue) && isNumber(cost) ? revenue - cost : null,
        marginRate:
          isNumber(revenue) && isNumber(cost)
            ? ratio(revenue - cost, revenue)
            : null,
        excluded: rr.length - eligible.length,
        signature: rr.some((r) => r.signature),
        isNew: rr.some((r) => r.isNew),
        trend: trend.map((t) => ({
          date: t.date,
          quantity: sum(
            rr.filter((r) => r.date === t.date).map((r) => r.quantity),
          ),
        })),
      };
    })
    .sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0))
    .slice(0, 10);
  return {
    stores,
    rows,
    current,
    previous,
    year,
    turnover,
    windows,
    channels,
    trend,
    ranking,
    activities,
    member,
    dishes,
    kpis: [
      {
        key: "revenue",
        label: data.meta.revenueLabel,
        value: current.revenue,
        unit: "money",
        mom: comparableChange(current.revenue, previous.revenue),
        yoy: comparableChange(
          current.revenue,
          year.revenue,
          current.partial,
          year.partial,
        ),
        achievement: !current.partial
          ? ratio(current.revenue, target("revenue"))
          : null,
      },
      {
        key: "ticket",
        label: "客单价",
        value: current.ticket,
        unit: "money",
        mom: change(current.ticket, previous.ticket),
        yoy: change(current.ticket, year.ticket),
        achievement: null,
      },
      {
        key: "recharge",
        label: "储值总额（实付）",
        value: member?.recharge ?? null,
        unit: "money",
        mom: change(member?.recharge, member?.rechargePrevious),
        yoy: change(member?.recharge, member?.rechargeYear),
        achievement: null,
      },
      {
        key: "orders",
        label: "总订单量",
        value: current.orders,
        unit: "count",
        mom: comparableChange(current.orders, previous.orders),
        yoy: comparableChange(
          current.orders,
          year.orders,
          current.partial,
          year.partial,
        ),
        achievement: !current.partial
          ? ratio(current.orders, target("orders"))
          : null,
      },
    ],
  };
}
