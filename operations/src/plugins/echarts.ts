// vue-echarts
import ECharts from "vue-echarts";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import {
  BarChart,
  PieChart,
  MapChart,
  EffectScatterChart,
  LineChart,
  GraphChart,
  ScatterChart,
} from "echarts/charts";
import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  VisualMapComponent,
  GeoComponent,
  MarkPointComponent,
  GraphicComponent,
} from "echarts/components";

use([
  CanvasRenderer,
  BarChart,
  PieChart,
  MapChart,
  EffectScatterChart,
  LineChart,
  GraphChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
  DatasetComponent,
  VisualMapComponent,
  GeoComponent,
  MarkPointComponent,
  GraphicComponent,
]);

export const registerEcharts = (app: any) => {
  app.component("v-chart", ECharts);
};
