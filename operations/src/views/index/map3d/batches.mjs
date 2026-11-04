import {
  InstancedMesh,
  BoxGeometry,
  MeshBasicMaterial,
  Matrix4,
  Vector3,
  Quaternion,
  Color,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
export function mergeOutlines(geometries) {
  const result = mergeGeometries(geometries, false);
  if (!result) throw Error("地图边线合并失败");
  return result;
}
export function createRevenueBatch(regions, depth) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const mesh = new InstancedMesh(
    new BoxGeometry(1.25, 1.25, 1),
    new MeshBasicMaterial({ transparent: true, opacity: 0.9 }),
    Math.max(1, regions.length),
  );
  mesh.count = 0;
  let ids = [],
    heights = new Map();
  const matrix = new Matrix4(),
    position = new Vector3(),
    scale = new Vector3(),
    rotation = new Quaternion();
  return {
    mesh,
    idAt: (index) => ids[index],
    height: (id) => heights.get(id) || 0,
    update(rows) {
      const valid = rows.filter(
        (row) =>
          Number.isFinite(row.revenue) &&
          row.revenue !== 0 &&
          byId.has(row.id) &&
          !byId.get(row.id).boundaryOnly,
      );
      const maximum = Math.max(1, ...valid.map((row) => Math.abs(row.revenue)));
      ids = [];
      heights = new Map();
      mesh.count = valid.length;
      for (let i = 0; i < valid.length; i++) {
        const row = valid[i],
          region = byId.get(row.id),
          height = 0.5 + (Math.abs(row.revenue) / maximum) * 11;
        ids.push(row.id);
        heights.set(row.id, height);
        position.set(
          region.center.x,
          region.center.y,
          depth + height / 2 + 0.1,
        );
        scale.set(1, 1, height);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, new Color(row.revenue < 0 ? 0xffbd70 : 0x69bdf5));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    },
  };
}
