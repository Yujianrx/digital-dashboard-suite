import type { Dataset, Filters, SnapshotStatus } from "./types";
import { validateDataset } from "./model.mjs";
export type DataSource = "demo" | "static" | "clickhouse";
export async function loadSnapshotStatus(
  signal: AbortSignal,
): Promise<SnapshotStatus> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/snapshot`, {
    signal,
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok || body.readMode !== "local-only")
    throw Error("本地快照状态不可用，请检查数据服务");
  return body;
}
export async function loadDataset(
  source: DataSource,
  signal: AbortSignal,
  filters: Filters,
): Promise<Dataset> {
  const params = new URLSearchParams({
    source,
    start: filters.start,
    end: filters.end,
    compareMode: filters.compareMode,
    period: filters.period || "month",
    regionId: filters.regionId,
    province: filters.province,
    city: filters.city,
    storeId: filters.storeId,
  });
  const url =
    source === "demo"
      ? `${import.meta.env.BASE_URL}data/template.json`
      : `${import.meta.env.BASE_URL}api/dashboard?${params}`;
  const response = await fetch(url, { signal, cache: "no-store" });
  const body = await response.json().catch(() => {
    throw Error("数据服务未返回 JSON，请检查启动状态");
  });
  if (!response.ok) throw Error(body.error || "数据源不可用");
  const data = validateDataset(body);
  if (source !== "demo" && data.meta.mode !== "real")
    throw Error("真实入口拒绝加载演示数据");
  return data;
}
