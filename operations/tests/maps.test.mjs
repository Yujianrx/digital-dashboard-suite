import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMapAsset,
  requiredChinaNames,
} from "../src/restaurant/map-assets.mjs";
const asset = {
  key: "china",
  source: "fixture",
  license: "fixture",
  reviewNumber: "fixture",
  verified: true,
  fullExtentConfirmed: true,
};
// Artificial test-only squares, never used as a map asset or shown in the app.
const geo = {
  type: "FeatureCollection",
  features: requiredChinaNames.map((name) => ({
    type: "Feature",
    properties: { name },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
  })),
};
test("unconfirmed map assets and missing national components are rejected", () => {
  assert.throws(() => validateMapAsset({ ...asset, verified: false }, geo));
  assert.throws(() => validateMapAsset({ ...asset, reviewNumber: "" }, geo));
  assert.throws(() =>
    validateMapAsset(asset, { ...geo, features: geo.features.slice(0, 33) }),
  );
  assert.throws(() =>
    validateMapAsset(asset, {
      ...geo,
      features: geo.features.map((f) => ({ ...f, geometry: null })),
    }),
  );
  assert.equal(validateMapAsset(asset, geo), true);
});
