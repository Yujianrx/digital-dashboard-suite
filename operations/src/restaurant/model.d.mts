import type { Dataset, Filters } from "./types";
export const DAY: number;
export function isNumber(v: unknown): v is number;
export function sum(values: unknown[]): number | null;
export function ratio(a: unknown, b: unknown): number | null;
export function change(a: unknown, b: unknown): number | null;
export function validDate(s: unknown): boolean;
export function addDays(s: string, n: number): string;
export function dates(start: string, end: string): string[];
export function shanghaiToday(now?: Date): string;
export function defaults(now?: Date): Filters;
export function comparisonRanges(
  start: string,
  end: string,
  mode?: string,
  period?: string,
): {
  previous: { start: string; end: string };
  year: { start: string; end: string } | null;
};
export function selectedStores(data: Dataset, f: Filters): Dataset["stores"];
export function validateDataset(d: unknown): Dataset;
export function deriveDashboard(data: Dataset, f: Filters): any;
export function classify(raw: string, mapping: Record<string, string>): string;
