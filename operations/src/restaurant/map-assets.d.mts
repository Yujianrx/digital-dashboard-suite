import type { MapAsset } from "./types";
export const requiredChinaNames: string[];
export function validateMapAsset(asset: MapAsset, geo: unknown): boolean;
export function validateMapGeometry(
  asset: Pick<MapAsset, "key" | "expectedNames">,
  geo: unknown,
): boolean;
