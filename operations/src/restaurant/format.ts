export function number(v: number | null | undefined, digits = 0) {
  return v == null || !Number.isFinite(v)
    ? "—"
    : new Intl.NumberFormat("zh-CN", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(v);
}
export function money(v: number | null | undefined, compact = false) {
  if (v == null) return "—";
  const yuan = v / 100;
  return compact && Math.abs(yuan) >= 10000
    ? number(yuan / 10000, 2) + "万"
    : number(yuan, 2);
}
export function percent(v: number | null | undefined) {
  return v == null ? "—" : number(v * 100, 1) + "%";
}
export function delta(v: number | null | undefined) {
  if (v == null) return "无可比基期";
  const rounded = Math.round(v * 1000) / 1000;
  return (rounded > 0 ? "+" : "") + percent(rounded);
}
