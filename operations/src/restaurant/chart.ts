import { channels } from "./config";
export const base = {
  animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
  animationDuration: 500,
  textStyle: {
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif',
    color: "#91a7bb",
    fontSize: 11,
  },
  tooltip: {
    trigger: "axis",
    renderMode: "richText",
    backgroundColor: "#102638",
    borderColor: "#274b64",
    textStyle: { color: "#def2ff" },
  },
  grid: { left: 48, right: 16, top: 20, bottom: 30 },
};
export function trendOption(rows: any[], split = false, lineLabel = "营收") {
  return {
    ...base,
    color: channels.map((c) => c.color),
    legend: split
      ? { top: 0, textStyle: { color: "#9db3c7", fontSize: 10 } }
      : undefined,
    grid: { ...base.grid, top: split ? 35 : 15 },
    xAxis: {
      type: "category",
      data: rows.map((r) => r.date.slice(5)),
      boundaryGap: false,
      axisLine: { lineStyle: { color: "#274258" } },
      axisLabel: { color: "#829aae", hideOverlap: true },
    },
    yAxis: {
      type: "value",
      name: "元",
      nameTextStyle: { color: "#829aae" },
      splitLine: { lineStyle: { color: "#1c3041", type: "dashed" } },
      axisLabel: {
        color: "#829aae",
        formatter: (v: number) =>
          v >= 10000 ? (v / 10000).toFixed(0) + "万" : v,
      },
    },
    series: split
      ? channels.map((c) => ({
          name: c.label,
          type: "line",
          smooth: true,
          showSymbol: false,
          connectNulls: false,
          data: rows.map((r) =>
            r.channels[c.id] == null ? null : r.channels[c.id] / 100,
          ),
          lineStyle: { width: 2 },
        }))
      : [
          {
            name: lineLabel,
            type: "line",
            smooth: true,
            showSymbol: false,
            connectNulls: false,
            lineStyle: { width: 3, color: "#66bdf1" },
            itemStyle: { color: "#66bdf1" },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "#66bdf138" },
                  { offset: 1, color: "#66bdf102" },
                ],
              },
            },
            data: rows.map((r) => (r.revenue == null ? null : r.revenue / 100)),
          },
        ],
  };
}
