import type { GeoCollection } from "./geometry.mjs";
export interface MapRow {
  id: string;
  name: string;
  selectionType: string;
  selectionId: string | null;
  revenue: number | null;
  orders: number | null;
  storeCount: number;
  matchedStoreIds: string[];
  activeStores: number;
  partial: boolean;
  ambiguous: boolean;
}
export interface RankingRow {
  id: string;
  name?: string;
  province: string;
  city: string;
  regionId: string;
  revenue: number | null;
  orders: number | null;
  lon?: number;
  lat?: number;
  [key: string]: any;
}
export function administrativeName(value: unknown): string;
export function buildMapRows(
  geo: GeoCollection | null,
  ranking: RankingRow[],
  field: "province" | "city",
  nameMap?: Record<string, string>,
): MapRow[];
export function coordinateCoverage<
  T extends { id: string; lon?: number; lat?: number },
>(ranking: T[]): { total: number; located: T[] };
