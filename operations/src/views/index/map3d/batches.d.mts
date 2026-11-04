import type { BufferGeometry, InstancedMesh, Vector2 } from "three";
export function mergeOutlines(geometries: BufferGeometry[]): BufferGeometry;
export function createRevenueBatch(
  regions: { id: string; center: Vector2; boundaryOnly?: boolean }[],
  depth: number,
): {
  mesh: InstancedMesh;
  idAt: (index: number) => string | undefined;
  height: (id: string) => number;
  update: (rows: { id: string; revenue: number | null }[]) => void;
};
