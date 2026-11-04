export function administrativeName(value) {
  return String(value || "")
    .trim()
    .replace(
      /(?:壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|自治州|省|市)$/,
      "",
    );
}
export function buildMapRows(geo, ranking, field, nameMap = {}) {
  if (!geo) return [];
  const total = (items, key) => {
    const known = items.map((r) => r[key]).filter(Number.isFinite);
    return known.length ? known.reduce((a, b) => a + b, 0) : null;
  };
  return geo.features.map((feature, index) => {
    const name = feature.properties?.name || "";
    const alias = nameMap[name];
    const matches = name
      ? ranking.filter((row) =>
          alias
            ? row[field] === alias
            : administrativeName(row[field]) === administrativeName(name),
        )
      : [];
    const ids = [...new Set(matches.map((r) => r[field]).filter(Boolean))];
    return {
      id: String(feature.properties?.adcode ?? name ?? index),
      name,
      selectionType: field,
      selectionId: ids.length === 1 ? ids[0] : null,
      revenue: total(matches, "revenue"),
      orders: total(matches, "orders"),
      storeCount: matches.length,
      matchedStoreIds: matches.map((r) => r.id),
      activeStores: matches.filter((r) => Number.isFinite(r.revenue)).length,
      partial: matches.some((r) => !Number.isFinite(r.revenue)),
      ambiguous: ids.length > 1,
    };
  });
}
export function coordinateCoverage(ranking) {
  return {
    total: ranking.length,
    located: ranking.filter(
      (r) =>
        Number.isFinite(r.lon) &&
        Number.isFinite(r.lat) &&
        Math.abs(r.lon) <= 180 &&
        Math.abs(r.lat) < 89.9 &&
        (r.lon !== 0 || r.lat !== 0),
    ),
  };
}
