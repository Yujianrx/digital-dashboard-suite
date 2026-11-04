import test from "node:test";
import assert from "node:assert/strict";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector2,
  Matrix4,
  Vector3,
} from "three";
import {
  createRevenueBatch,
  mergeOutlines,
} from "../src/views/index/map3d/batches.mjs";
test("revenue instances preserve signed real values and the selected region identity", () => {
  const batch = createRevenueBatch(
    [
      { id: "a", center: new Vector2(1, 2) },
      { id: "b", center: new Vector2(3, 4) },
      { id: "c", center: new Vector2(5, 6) },
    ],
    1.8,
  );
  batch.update([
    { id: "a", revenue: 5000 },
    { id: "b", revenue: -2000 },
    { id: "c", revenue: null },
  ]);
  assert.equal(batch.mesh.count, 2);
  assert.equal(batch.idAt(1), "b");
  assert.equal(batch.height("a"), 11.5);
  const matrix = new Matrix4();
  batch.mesh.getMatrixAt(0, matrix);
  const point = new Vector3().setFromMatrixPosition(matrix);
  assert.equal(point.x, 1);
  assert.equal(point.y, 2);
  assert.ok(Math.abs(point.z - (1.8 + 11.5 / 2 + 0.1)) < 1e-5);
  batch.update([
    { id: "a", revenue: 0 },
    { id: "b", revenue: null },
  ]);
  assert.equal(batch.mesh.count, 0);
  assert.equal(batch.idAt(0), undefined);
});
test("outline batching retains every segment", () => {
  const line = () =>
    new BufferGeometry().setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3),
    );
  const result = mergeOutlines([line(), line()]);
  assert.equal(result.attributes.position.count, 4);
});
