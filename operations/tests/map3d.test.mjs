import test from "node:test";
import assert from "node:assert/strict";
import { buildMapGeometry } from "../src/views/index/map3d/geometry.mjs";
import {
  buildMapRows,
  coordinateCoverage,
} from "../src/views/index/map3d/data.mjs";

const ring = (x = 100, y = 20) => [
  [x, y],
  [x + 4, y],
  [x + 4, y + 4],
  [x, y + 4],
  [x, y],
];
const feature = (name, geometry, adcode = name) => ({
  type: "Feature",
  properties: { name, adcode },
  geometry,
});
const collection = (...features) => ({ type: "FeatureCollection", features });
const geo = collection(
  feature("浙江省", { type: "Polygon", coordinates: [ring()] }),
);

test("3D geometry preserves polygon holes and disjoint islands", () => {
  const g = buildMapGeometry(
    collection(
      feature("孔洞", {
        type: "Polygon",
        coordinates: [
          ring(),
          ring(101, 21).map(([x, y]) => [
            100 + (x - 100) / 3,
            20 + (y - 20) / 3,
          ]),
        ],
      }),
      feature("岛屿", {
        type: "MultiPolygon",
        coordinates: [[ring(110, 20)], [ring(120, 20)]],
      }),
    ),
  );
  assert.equal(g.regions[0].shapes.length, 1);
  assert.equal(g.regions[0].shapes[0].holes.length, 1);
  assert.equal(g.regions[1].shapes.length, 2);
  assert.ok(g.bounds.width > 0 && g.bounds.height > 0);
  assert.ok(Number.isFinite(g.project([120, 30]).x));
});
test("3D geometry rejects invalid coordinates and unsupported geometries", () => {
  assert.throws(() =>
    buildMapGeometry(
      collection(
        feature("bad", {
          type: "Polygon",
          coordinates: [
            [
              [Infinity, 0],
              [1, 0],
              [1, 1],
              [Infinity, 0],
            ],
          ],
        }),
      ),
    ),
  );
  assert.throws(() =>
    buildMapGeometry(
      collection(feature("bad", { type: "Point", coordinates: [120, 30] })),
    ),
  );
  assert.throws(() => buildMapGeometry(collection()));
});
test("map values aggregate scoped integer fen and preserve raw database selections", () => {
  const rows = buildMapRows(
    geo,
    [
      {
        id: "a",
        province: "浙江",
        regionId: "north",
        revenue: 12345,
        orders: 5,
      },
      {
        id: "b",
        province: "浙江",
        regionId: "south",
        revenue: 6789,
        orders: 3,
      },
    ],
    "province",
  );
  assert.equal(rows[0].revenue, 19134);
  assert.equal(rows[0].orders, 8);
  assert.equal(rows[0].selectionId, "浙江");
  assert.equal(rows[0].storeCount, 2);
  const north = buildMapRows(
    geo,
    [
      {
        id: "a",
        province: "浙江",
        regionId: "north",
        revenue: 12345,
        orders: 5,
      },
    ],
    "province",
  );
  assert.equal(north[0].revenue, 12345);
});
test("unknown and zero metrics stay distinct and ambiguous names cannot mis-drill", () => {
  const unknown = buildMapRows(
    geo,
    [{ id: "a", province: "浙江", revenue: null, orders: null }],
    "province",
  )[0];
  assert.equal(unknown.revenue, null);
  assert.equal(unknown.partial, true);
  const zero = buildMapRows(
    geo,
    [{ id: "a", province: "浙江", revenue: 0, orders: 0 }],
    "province",
  )[0];
  assert.equal(zero.revenue, 0);
  const ambiguous = buildMapRows(
    geo,
    [
      { id: "a", province: "浙江", revenue: 1 },
      { id: "b", province: "浙江省", revenue: 2 },
    ],
    "province",
  )[0];
  assert.equal(ambiguous.revenue, 3);
  assert.equal(ambiguous.selectionId, null);
});
test("coordinate coverage never substitutes city centers for missing shop coordinates", () => {
  const result = coordinateCoverage([
    { id: "missing", city: "杭州" },
    { id: "zero", lon: 0, lat: 0 },
    { id: "valid", lon: 120.1, lat: 30.2 },
  ]);
  assert.equal(result.total, 3);
  assert.equal(result.located.length, 1);
  assert.equal(result.located[0].id, "valid");
});
