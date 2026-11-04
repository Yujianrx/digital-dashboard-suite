export {
  requiredChinaNames,
  validateMapAsset,
} from "@/restaurant/map-assets.mjs";
export function optionHandle(
  key: string,
  values: any[],
  stores: any[],
  nameMap: Record<string, string> = {},
) {
  return {
    backgroundColor: "transparent",
    tooltip: { renderMode: "richText", trigger: "item" },
    visualMap: {
      min: 0,
      max: Math.max(1, ...values.map((v) => v.value)),
      show: false,
      inRange: { color: ["#13314a", "#287e99", "#36dfc2"] },
    },
    geo: {
      map: key,
      nameMap,
      roam: false,
      layoutCenter: ["50%", "50%"],
      layoutSize: "95%",
      itemStyle: { areaColor: "#15334b", borderColor: "#48809b" },
      emphasis: { itemStyle: { areaColor: "#236a7a" } },
    },
    series: [
      {
        type: "map",
        map: key,
        nameMap,
        geoIndex: 0,
        data: values,
        name: "营收（元）",
      },
      {
        type: "effectScatter",
        coordinateSystem: "geo",
        data: stores
          .filter((s) => Number.isFinite(s.lon) && Number.isFinite(s.lat))
          .map((s) => ({
            name: s.name,
            storeId: s.id,
            value: [s.lon, s.lat, s.revenue == null ? 0 : s.revenue / 100],
          })),
        symbolSize: 10,
        itemStyle: { color: "#f7c76f" },
        rippleEffect: { scale: 3 },
        tooltip: { renderMode: "richText" },
      },
    ],
  };
}
