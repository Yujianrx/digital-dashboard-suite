import { fixtureDataset } from "./fixtures/dataset.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMemberQueries,
  memberFromAggregates,
} from "../server/member-profile.mjs";
import { assertReadOnly } from "../server/clickhouse.mjs";
import { deriveDashboard } from "../src/restaurant/model.mjs";
const filters = {
  start: "2026-10-01",
  end: "2026-10-29",
  compareMode: "last-month",
  period: "month",
};
test("member queries use exact IDs, actual scope, named dates and bounded readonly SQL", () => {
  const queries = buildMemberQueries(filters, ["STORE001"], false);
  Object.values(queries).forEach((query) =>
    assert.doesNotThrow(() => assertReadOnly(query)),
  );
  assert.match(queries.cohort, /first_shopno IN/);
  assert.match(queries.cohort, /2026-10-30 00:00:00/);
  assert.match(queries.customers, /GROUP BY userid/);
  assert.match(queries.customers, /customer_label/);
  assert.match(queries.customers, /seenNew=0 AND seenOld=1/);
  assert.match(queries.recharge, /order_state='正常'/);
  assert.match(queries.recharge, /2026-09-29/);
});
test("member values preserve monetary fen, unknown cohorts and duplicate-balance protection", () => {
  const data = memberFromAggregates(
    filters,
    ["s"],
    {
      cohort: {
        total: "10",
        sourceRows: "10",
        newMembers: "2",
        registeredNewMembers: "1",
        balance: "50000",
        unassignedMembers: "3",
      },
      recharge: {
        recharge: "10000",
        rechargePrevious: "8000",
        rechargeYear: null,
      },
      customers: {
        activeCustomers: "8",
        newCustomers: "2",
        returningCustomers: "3",
        repeatNumerator: "4",
      },
    },
    true,
  );
  assert.equal(data.balance, 50000);
  assert.equal(data.recharge, 10000);
  assert.equal(data.unclassifiedCustomers, 3);
  assert.equal(data.repeatDenominator, 8);
  assert.equal(data.rechargeYear, null);
  assert.equal(data.memberAmount, null);
  const duplicates = memberFromAggregates(
    filters,
    ["s"],
    { cohort: { total: "1", sourceRows: "2", balance: "100" } },
    false,
  );
  assert.equal(duplicates.balance, null);
});
test("stored-value KPI uses matching member scope and its own comparisons", () => {
  const data = structuredClone(fixtureDataset);
  const f = { ...filters, regionId: "", province: "", city: "", storeId: "" };
  data.members = [
    {
      start: f.start,
      end: f.end,
      storeIds: data.stores.map((s) => s.id),
      recharge: 10000,
      rechargePrevious: 8000,
      rechargeYear: null,
    },
  ];
  const kpi = deriveDashboard(data, f).kpis[2];
  assert.equal(kpi.key, "recharge");
  assert.equal(kpi.value, 10000);
  assert.equal(kpi.mom, 0.25);
  assert.equal(kpi.yoy, null);
  assert.equal(kpi.achievement, null);
});
