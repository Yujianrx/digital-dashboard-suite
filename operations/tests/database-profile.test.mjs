import test from "node:test";
import assert from "node:assert/strict";
import {
  databaseChannel,
  resolveDatabaseStores,
} from "../server/database-profile.mjs";
import { deriveDashboard } from "../src/restaurant/model.mjs";
test("database mapping uses explicit shop region then unambiguous database geographic relations", () => {
  const shops = [
    {
      shopId: "a",
      shopName: "A",
      province: "福建",
      city: "厦门",
      district: "集美",
      status: "营业中",
    },
    {
      shopId: "b",
      shopName: "B",
      province: "浙江",
      city: "台州",
      district: "玉环",
    },
    { shopId: "c", shopName: "C", province: "未知", city: "未知" },
  ];
  const result = resolveDatabaseStores(
    shops,
    [{ shop_id: "a", region: "数据库战区甲" }],
    [
      {
        province: "福建省",
        city: "厦门",
        district: "",
        region: "不应覆盖明确门店映射",
      },
      {
        province: "浙江省",
        city: "台州",
        district: "",
        region: "数据库战区乙",
      },
    ],
  );
  assert.equal(result[0].regionName, "数据库战区甲");
  assert.equal(result[1].regionName, "数据库战区乙");
  assert.equal(result[2].regionId, "unconfirmed");
  assert.equal(result[0].province, "福建");
  assert.throws(() =>
    resolveDatabaseStores(
      shops,
      [
        { shop_id: "a", region: "一" },
        { shop_id: "a", region: "二" },
      ],
      [],
    ),
  );
});
test("channel precedence is exclusive when scene, source and payment overlap", () => {
  assert.equal(databaseChannel("团购", "抖音外卖"), "delivery");
  assert.equal(databaseChannel("团购", "微信小程序"), "group");
  assert.equal(databaseChannel("纯堂食", "微信小程序"), "mini");
  assert.equal(databaseChannel("纯堂食", "POS"), "dine-in");
  assert.equal(databaseChannel("未知", "未知"), "unmapped");
});
test("authoritative overview preserves valid ticket while group order allocation stays missing", () => {
  const f = {
    start: "2026-10-01",
    end: "2026-10-01",
    compareMode: "last-month",
    regionId: "",
    province: "",
    city: "",
    storeId: "",
  };
  const data = {
    meta: { coveragePolicy: "observed-records", revenueLabel: "总营收" },
    stores: [{ id: "a", name: "A", regionId: "r", province: "p", city: "c" }],
    facts: [
      {
        date: f.start,
        storeId: "a",
        channel: "group",
        revenue: 4000,
        orders: null,
      },
      {
        date: f.start,
        storeId: "a",
        channel: "dine-in",
        revenue: 6000,
        orders: 4,
      },
    ],
    overviewFacts: [{ date: f.start, storeId: "a", revenue: 10000, orders: 4 }],
    targets: [],
    capacity: [],
    activities: [],
    members: [],
    dishes: [],
  };
  const r = deriveDashboard(data, f);
  assert.equal(r.current.revenue, 10000);
  assert.equal(r.current.ticket, 2500);
  assert.equal(r.channels.find((c) => c.id === "group").orders, null);
  assert.equal(r.channels.find((c) => c.id === "group").share, 0.4);
});
