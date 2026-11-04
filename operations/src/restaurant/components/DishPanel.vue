<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Panel from "./Panel.vue";
import { number, percent, money } from "../format";
import { base } from "../chart";
const props = defineProps<{ items: any[] }>();
const selected = ref("");
watch(
  () => props.items,
  (items) => {
    if (!items.some((d) => d.id === selected.value))
      selected.value = items.find((d) => d.isNew)?.id || items[0]?.id || "";
  },
  { immediate: true },
);
const dish = computed(() => props.items.find((d) => d.id === selected.value));
const option = computed(() => ({
  ...base,
  grid: { left: 30, right: 10, top: 10, bottom: 18 },
  xAxis: {
    type: "category",
    data: dish.value?.trend.map((r: any) => r.date.slice(5)),
    axisLabel: { color: "#829aae", fontSize: 9, hideOverlap: true },
  },
  yAxis: {
    type: "value",
    axisLabel: { color: "#829aae", fontSize: 9 },
    splitLine: { show: false },
  },
  series: [
    {
      type: "line",
      smooth: true,
      showSymbol: false,
      lineStyle: { color: "#ac94ff", width: 2 },
      data: dish.value?.trend.map((r: any) => r.quantity),
    },
  ],
}));
</script>
<template>
  <Panel title="菜品销量与毛利" eyebrow="MENU PERFORMANCE" tag="TOP 10"
    ><template v-if="items.length"
      ><div class="dish-table">
        <table>
          <thead>
            <tr>
              <th>菜品</th>
              <th>销量</th>
              <th>毛利额 / 率</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(d, i) in items"
              :key="d.id"
              :class="{ selected: selected === d.id }"
              @click="selected = d.id"
            >
              <td>
                <button class="dish-select" @click.stop="selected = d.id">
                  <span class="rank-number">{{
                    String(i + 1).padStart(2, "0")
                  }}</span
                  >{{ d.name }}<i v-if="d.signature" class="mini-tag">招牌</i
                  ><i v-if="d.isNew" class="mini-tag purple">新</i>
                </button>
              </td>
              <td>{{ number(d.quantity) }}</td>
              <td>{{ money(d.margin, true) }} / {{ percent(d.marginRate) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="dish-trend-head">{{ dish?.name }} · 日销量趋势</div>
      <div class="dish-trend"><v-chart :option="option" autoresize /></div>
      <p class="micro">
        毛利剔除缺成本及零成本记录；{{
          items.reduce((n, d) => n + d.excluded, 0)
        }}
        条明细未参与毛利率。真实成本与打包费口径待核实。
      </p></template
    >
    <p v-else class="empty">
      数据库菜品字段已发现；销量粒度、成本和套餐拆分口径待核实。
    </p></Panel
  >
</template>
