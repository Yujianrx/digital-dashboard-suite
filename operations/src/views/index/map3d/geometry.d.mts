import type { Shape, Vector2 } from "three";
export interface GeoFeature {
  type: string;
  properties: Record<string, any>;
  geometry: { type: string; coordinates: any[] };
}
export interface GeoCollection {
  type: string;
  features: GeoFeature[];
}
export interface MapGeometry {
  regions: {
    id: string;
    name: string;
    shapes: Shape[];
    center: Vector2;
    boundaryOnly: boolean;
  }[];
  bounds: { width: number; height: number };
  project: (coord: number[]) => Vector2;
  vertices: number;
}
export function buildMapGeometry(geo: GeoCollection): MapGeometry;
