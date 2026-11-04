<script setup lang="ts">
import { computed } from "vue";
import Panel from "./Panel.vue";
import { channels } from "../config";
import { money, number, percent, delta } from "../format";
defineOptions({ inheritAttrs: false });
const props = defineProps<{ summary: any }>();
const items = computed(() =>
  props.summary.channels
    .filter((c: any) => c.id !== "unmapped" || c.revenue != null)
    .map((c: any) => ({
      ...c,
      ...(channels.find((x) => x.id === c.id) || {
        label: "未映射",
        color: "#8493a0",
      }),
    })),
);
const signed = computed(() =>
  items.value.some((c: any) => (c.revenue ?? 0) < 0),
);
const option = computed(() => ({
  color: items.value.map((c: any) => c.color),
  tooltip: { renderMode: "richText", trigger: "item" },
  ...(signed.value
    ? {
        grid: { left: 55, right: 15, top: 10, bottom: 20 },
        xAxis: { type: "value", axisLabel: { color: "#829aae" } },
        yAxis: {
          type: "category",
          data: items.value.map((c: any) => c.label),
          axisLabel: { color: "#bdd5e4" },
        },
        series: [
          {
            type: "bar",
            data: items.value.map((c: any) => ({
              value: c.revenue == null ? null : c.revenue / 100,
              itemStyle: { color: c.color },
            })),
          },
        ],
      }
    : {
        series: [
          {
            type: "pie",
            radius: ["62%", "80%"],
            center: ["50%", "50%"],
            avoidLabelOverlap: true,
            label: { show: false },
            itemStyle: {
              borderColor: "#0b1a29",
              borderWidth: 4,
              borderRadius: 4,
            },
            data: items.value
              .filter((c: any) => c.revenue != null && c.revenue > 0)
              .map((c: any) => ({ name: c.label, value: c.revenue / 100 })),
          },
        ],
      }),
  graphic: signed.value
    ? undefined
    : [
        {
          type: "text",
          left: "center",
          top: "41%",
          style: {
            text: "渠道构成",
            fill: "#d6f0f5",
            font: "14px Microsoft YaHei",
          },
        },
      ],
}));
</script>
<template>
  <Panel
    title="渠道营业结构"
    eyebrow="REVENUE MIX"
    tag="四渠道并列"
    v-bind="$attrs"
    ><div class="channel-layout">
      <div class="donut">
        <v-chart :option="option" autoresize aria-label="各渠道营收构成" />
      </div>
      <div class="channel-legend">
        <div v-for="c in items" :key="c.id">
          <span><i :style="{ background: c.color }"></i>{{ c.label }}</span
          ><b>{{ percent(c.share) }}</b>
        </div>
      </div>
    </div>
    <div class="channel-grid">
      <article v-for="c in items" :key="c.id" :data-testid="'channel-' + c.id">
        <span
          ><i class="dot" :style="{ background: c.color }"></i
          >{{ c.label }}</span
        ><strong>{{ money(c.revenue, true) }}<small>元</small></strong>
        <div>
          {{ number(c.orders) }} 单
          <b
            :class="
              c.mom == null ? 'muted' : c.mom >= 0 ? 'positive' : 'negative'
            "
            >{{ delta(c.mom) }}</b
          >
        </div>
      </article>
    </div>
    <p class="micro">
      {{
        signed
          ? "存在退款负收入，已改为净额条形图。"
          : "占比以当前净营收为分母；缺录显示 —。"
      }}
      未映射渠道保留，不重复归类。
    </p></Panel
  >
</template>
