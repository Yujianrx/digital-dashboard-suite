// Synthetic test-only inputs. Never served by the application.
import { addDays, dates, validateDataset } from "../../src/restaurant/model.mjs";
const stores = [
  [
    "d01",
    "示例·杭州湖滨店",
    "east",
    "示例华东大区",
    "浙江省",
    "330000",
    "杭州市",
    120.16,
    30.25,
  ],
  [
    "d02",
    "示例·杭州滨江店",
    "east",
    "示例华东大区",
    "浙江省",
    "330000",
    "杭州市",
    120.21,
    30.21,
  ],
  [
    "d03",
    "示例·宁波天一店",
    "east",
    "示例华东大区",
    "浙江省",
    "330000",
    "宁波市",
    121.55,
    29.87,
  ],
  [
    "d04",
    "示例·上海徐汇店",
    "east",
    "示例华东大区",
    "上海市",
    "310000",
    "上海市",
    121.43,
    31.19,
  ],
  [
    "d05",
    "示例·南京新街口店",
    "east",
    "示例华东大区",
    "江苏省",
    "320000",
    "南京市",
    118.78,
    32.04,
  ],
  [
    "d06",
    "示例·厦门集美店",
    "south",
    "示例东南大区",
    "福建省",
    "350000",
    "厦门市",
    118.1,
    24.57,
  ],
  [
    "d07",
    "示例·福州东街店",
    "south",
    "示例东南大区",
    "福建省",
    "350000",
    "福州市",
    119.3,
    26.08,
  ],
  [
    "d08",
    "示例·广州天河店",
    "south",
    "示例东南大区",
    "广东省",
    "440000",
    "广州市",
    113.32,
    23.13,
  ],
  [
    "d09",
    "示例·深圳南山店",
    "south",
    "示例东南大区",
    "广东省",
    "440000",
    "深圳市",
    113.93,
    22.52,
  ],
  [
    "d10",
    "示例·成都春熙店",
    "west",
    "示例西南大区",
    "四川省",
    "510000",
    "成都市",
    104.07,
    30.66,
  ],
  [
    "d11",
    "示例·重庆观音桥店",
    "west",
    "示例西南大区",
    "重庆市",
    "500000",
    "重庆市",
    106.53,
    29.57,
  ],
  [
    "d12",
    "示例·昆明南屏店",
    "west",
    "示例西南大区",
    "云南省",
    "530000",
    "昆明市",
    102.71,
    25.04,
  ],
].map(
  ([
    id,
    name,
    regionId,
    regionName,
    province,
    provinceCode,
    city,
    lon,
    lat,
  ]) => ({
    id,
    name,
    regionId,
    regionName,
    province,
    provinceCode,
    city,
    lon,
    lat,
    status: "营业",
  }),
);
const data = {
  schemaVersion: 1,
  meta: {
    mode: "demo",
    source: "确定性合成数据，非真实经营结果",
    title: "餐饮连锁",
    revenueLabel: "总营收（示例）",
    revenueDefinition:
      "演示收入按整数分生成；不代表实收/营业额/预计收入任一生产定义",
    timezone: "Asia/Shanghai",
    generatedAt: "2026-10-30T00:00:00+08:00",
    coverage: { start: "2025-09-01", end: "2026-11-15" },
    warnings: [
      "所有门店、大区归属与指标值均为演示。",
      "地图资产未启用：需提供来源、授权与完整性依据。",
      "活动观察差额不代表因果增量；ROI未配置。",
    ],
    freshness: "固定演示数据，不是实时数据",
  },
  stores,
  facts: [],
  targets: [],
  capacity: [],
  activities: [],
  members: [],
  dishes: [],
};
const channelIds = ["dine-in", "delivery", "group", "mini"],
  share = [0.42, 0.34, 0.14, 0.1];
for (const [start, end, factor] of [
  ["2025-09-01", "2025-11-15", 0.88],
  ["2026-08-01", "2026-11-15", 1],
])
  for (const date of dates(start, end))
    for (const [i, s] of stores.entries()) {
      const weekday = new Date(date).getUTCDay(),
        day = Number(date.slice(-2)),
        boost = date >= "2026-10-10" && date <= "2026-10-25" ? 1.12 : 1;
      const total = Math.round(
        (850000 + i * 52000 + (day % 7) * 16000) *
          (weekday === 0 || weekday === 6 ? 1.18 : 1) *
          factor *
          boost,
      );
      for (const [j, ch] of channelIds.entries())
        data.facts.push({
          date,
          storeId: s.id,
          channel: ch,
          revenue: Math.round(total * share[j]),
          orders: Math.round((total * share[j]) / (3400 + j * 350)),
        });
      data.targets.push({
        date,
        storeId: s.id,
        revenue: 1100000 + i * 45000,
        orders: 315 + i * 11,
      });
      data.capacity.push({
        date,
        storeId: s.id,
        tableUses: Math.round(80 + (i % 4) * 5 + (day % 7) * 3),
        availableTables: 30,
      });
      for (let j = 0; j < 10; j++)
        data.dishes.push({
          date,
          storeId: s.id,
          id: "dish" + j,
          name: [
            "招牌酸菜鱼",
            "金汤番茄鱼",
            "青花椒鱼",
            "藤椒鸡米饭",
            "香酥鱼排",
            "麻辣小酥肉",
            "柠檬手打茶",
            "时蔬拼盘",
            "新品·双椒鱼",
            "招牌米饭",
          ][j],
          quantity: Math.round((45 - j * 3) * (1 + (day % 5) / 10)),
          revenue: (45 - j * 3) * (3800 - j * 180),
          cost: j === 6 ? 0 : (45 - j * 3) * (1400 - j * 60),
          signature: j === 0 || j === 9,
          isNew: j === 8,
        });
    }
for (const [id, name, start, end, type, covered] of [
  [
    "a1",
    "秋日尝鲜 · 招牌第二份半价",
    "2026-10-10",
    "2026-10-25",
    "门店促销",
    stores.slice(0, 5),
  ],
  [
    "a2",
    "会员日 · 周四储值礼",
    "2026-10-01",
    "2026-10-31",
    "会员运营",
    stores.slice(5, 9),
  ],
  [
    "a3",
    "新品双椒鱼 · 首发季",
    "2026-10-20",
    "2026-11-10",
    "新品推广",
    stores.slice(9),
  ],
]) {
  const daily = [];
  for (const date of dates(start, end))
    for (const s of covered)
      daily.push({
        date,
        storeId: s.id,
        issued: 100,
        redeemed: 43 + (Number(date.slice(-2)) % 20),
      });
  data.activities.push({
    id,
    name,
    start,
    end,
    type,
    storeIds: covered.map((s) => s.id),
    cost: null,
    attributedMargin: null,
    attributedRevenueIncrement: null,
    daily,
  });
}
data.members = [
  {
    start: "2026-10-01",
    end: "2026-10-29",
    storeIds: stores.map((s) => s.id),
    total: 186420,
    newCustomers: 4930,
    returningCustomers: 12670,
    repeatNumerator: 6130,
    repeatDenominator: 17600,
    balance: 91862000,
    newMembers: 3820,
    memberAmount: 637200000,
    memberVisits: 17600,
    recharge: 93800000,
    definition:
      "演示专用：期间同一会员消费≥2次 / 期间有消费会员；跨店按虚拟ID去重。真实口径待核实。",
  },
];

for (const [index, store] of stores.entries()) store.name = `测试门店-${index + 1}`;
export const fixtureDataset = validateDataset(data);
