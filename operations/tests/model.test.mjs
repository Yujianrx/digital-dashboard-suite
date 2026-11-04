import { fixtureDataset } from "./fixtures/dataset.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  sum,
  ratio,
  change,
  comparisonRanges,
  defaults,
  deriveDashboard,
  validateDataset,
  classify,
  dates,
} from "../src/restaurant/model.mjs";
const demo = structuredClone(fixtureDataset);
const f = {
  start: "2026-10-01",
  end: "2026-10-29",
  compareMode: "last-month",
  regionId: "",
  province: "",
  city: "",
  storeId: "",
};
test("missing is not zero, zero baseline has no percentage", () => {
  assert.equal(sum([null, undefined]), null);
  assert.equal(sum([0, null]), 0);
  assert.equal(ratio(10, 0), null);
  assert.equal(change(10, 0), null);
  assert.equal(change(0, 10), -1);
});
test("Shanghai completed day default and leap comparison", () => {
  assert.equal(defaults(new Date("2026-10-29T18:00:00Z")).end, "2026-10-29");
  assert.equal(defaults(new Date("2026-10-01T00:00:00Z")).start, "2026-09-01");
  assert.deepEqual(comparisonRanges("2026-03-01", "2026-03-31").previous, {
    start: "2026-02-01",
    end: "2026-02-28",
  });
  assert.equal(comparisonRanges("2024-02-29", "2024-02-29").year, null);
  assert.deepEqual(
    comparisonRanges("2026-10-01", "2026-10-07", "previous-period").previous,
    { start: "2026-09-24", end: "2026-09-30" },
  );
  assert.throws(() => dates("2026-02-30", "2026-03-01"));
  assert.throws(() => dates("2025-01-01", "2026-12-01"));
});
test("weighted ticket and exclusive channel reconciliation", () => {
  const r = deriveDashboard(demo, f);
  assert.equal(r.current.ticket, r.current.revenue / r.current.orders);
  assert.equal(
    r.channels.reduce((n, c) => n + (c.revenue || 0), 0),
    r.current.revenue,
  );
  assert.ok(
    Math.abs(r.channels.reduce((n, c) => n + (c.share || 0), 0) - 1) < 1e-12,
  );
  assert.equal(classify("unknown", {}), "unmapped");
});
test("regular year-over-year period remains available", () => {
  assert.deepEqual(comparisonRanges("2026-10-01", "2026-10-29").year, {
    start: "2025-10-01",
    end: "2025-10-29",
  });
  assert.ok(deriveDashboard(demo, f).kpis[0].yoy > 0);
});
test("custom range comparison preserves reference dashboard equal-day window", () => {
  assert.deepEqual(
    comparisonRanges("2026-03-15", "2026-04-15", "last-month", "range")
      .previous,
    { start: "2026-02-15", end: "2026-03-18" },
  );
});
test("missing business day does not produce full-period percentages or turnover", () => {
  const copy = structuredClone(demo);
  copy.facts = copy.facts.filter((r) => r.date !== "2026-10-02");
  copy.capacity = copy.capacity.filter((r) => r.date !== "2026-10-02");
  const r = deriveDashboard(copy, f);
  assert.equal(r.current.partial, true);
  assert.equal(r.current.ticket, null);
  assert.equal(r.kpis[0].yoy, null);
  assert.equal(r.turnover, null);
});
test("region → province → store reduces all modules and preserves scope", () => {
  const full = deriveDashboard(demo, f),
    region = deriveDashboard(demo, { ...f, regionId: "east" }),
    province = deriveDashboard(demo, {
      ...f,
      regionId: "east",
      province: "浙江省",
    }),
    store = deriveDashboard(demo, { ...f, storeId: "d01" });
  assert.equal(full.stores.length, 12);
  assert.equal(region.stores.length, 5);
  assert.equal(province.stores.length, 3);
  assert.equal(store.stores.length, 1);
  assert.ok(
    full.current.revenue > region.current.revenue &&
      region.current.revenue > province.current.revenue &&
      province.current.revenue > store.current.revenue,
  );
  assert.equal(store.ranking.length, 1);
  assert.equal(store.member, null);
  assert.ok(store.activities.every((a) => a.storeIds.includes("d01")));
  assert.equal(
    store.trend.reduce((n, d) => n + (d.revenue || 0), 0),
    store.current.revenue,
  );
});
test("no attribution or cost means no causal increment or ROI", () => {
  const r = deriveDashboard(demo, f);
  assert.ok(r.activities.length > 0);
  assert.ok(r.activities.every((a) => a.increment === null && a.roi === null));
  assert.ok(r.activities[0].redemption > 0);
  assert.equal(r.activities[0].phases.length, 3);
});
test("member aggregates require exact date and store scope", () => {
  assert.ok(deriveDashboard(demo, f).member);
  assert.equal(deriveDashboard(demo, { ...f, end: "2026-10-28" }).member, null);
  assert.equal(deriveDashboard(demo, { ...f, regionId: "east" }).member, null);
});
test("zero cost is excluded from dish margin; all ten dishes present", () => {
  const dishes = deriveDashboard(demo, f).dishes;
  assert.equal(dishes.length, 10);
  const zero = dishes.find((d) => d.id === "dish6");
  assert.equal(zero.marginRate, null);
  assert.ok(zero.excluded > 0);
  assert.ok(dishes.some((d) => d.signature));
  assert.ok(dishes.some((d) => d.isNew));
});
test("partial orders do not produce a misleading ticket or share", () => {
  const copy = structuredClone(demo);
  copy.facts.find((r) => r.date === "2026-10-01").orders = null;
  const r = deriveDashboard(copy, f);
  assert.equal(r.current.ticket, null);
  assert.equal(r.current.partial, true);
  assert.ok(r.channels.every((c) => c.share === null));
  assert.equal(r.kpis[0].achievement, null);
});
test("invalid/duplicate facts and unknown stores are rejected", () => {
  assert.equal(validateDataset(demo), demo);
  const copy = structuredClone(demo);
  copy.facts.push(copy.facts[0]);
  assert.throws(() => validateDataset(copy));
  copy.facts.pop();
  copy.facts[0].storeId = "unknown";
  assert.throws(() => validateDataset(copy));
  copy.facts[0].storeId = demo.facts[0].storeId;
  copy.facts[0].revenue = Infinity;
  assert.throws(() => validateDataset(copy));
});
test("empty scope stays empty, targets are not fabricated", () => {
  const r = deriveDashboard(demo, { ...f, regionId: "nonexistent" });
  assert.equal(r.current.revenue, null);
  assert.equal(r.turnover, null);
  assert.equal(r.member, null);
  assert.equal(r.activities.length, 0);
  assert.ok(r.kpis.every((k) => k.achievement === null));
});
