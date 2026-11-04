<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Panel from "./Panel.vue";
import { base, trendOption } from "../chart";
import { money, number, percent, delta } from "../format";
const props = defineProps<{ items: any[]; stores: any[] }>();
const selected = ref("");
watch(
  () => props.items,
  (items) => {
    if (!items.some((a) => a.id === selected.value))
      selected.value = items[0]?.id || "";
  },
  { immediate: true },
);
const active = computed(() => props.items.find((a) => a.id === selected.value));
const covered = computed(() =>
  active.value?.storeIds
    .map((id: string) => props.stores.find((s) => s.id === id)?.name || id)
    .join("、"),
);
const option = computed(() => ({
  ...base,
  grid: { left: 45, right: 12, top: 15, bottom: 30 },
  xAxis: {
    type: "category",
    data: active.value?.phases.map((p: any) => p.label),
    axisLabel: { color: "#8ba3b8", fontSize: 10 },
    axisLine: { lineStyle: { color: "#244357" } },
  },
  yAxis: {
    type: "value",
    axisLabel: {
      color: "#8ba3b8",
      formatter: (v: number) => (v / 10000).toFixed(1) + "万",
    },
    splitLine: { lineStyle: { color: "#1c3041" } },
  },
  series: [
    {
      name: "观察窗口营收（元）",
      type: "bar",
      barWidth: 24,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
      data: active.value?.phases.map((p: any, i: number) => ({
        value: p.revenue == null ? null : p.revenue / 100,
        itemStyle: { color: ["#467f9c", "#39dfc6", "#7b8bb8"][i] },
      })),
    },
  ],
}));
const displayedOption = computed(() =>
  active.value?.dateBasis === "observed-records"
    ? trendOption(active.value.reportedTrend || [],false,active.value.reportedLabel||'储值实付')
    : option.value,
);
</script>
<template>
  <Panel
    title="当期活动与效果"
    eyebrow="CAMPAIGN OBSERVATORY"
    :tag="
      items.length +
      (items.some((a) => a.dateBasis === 'observed-records')
        ? ' 个储值方案'
        : ' 场')
    "
    ><label class="sr-only" for="campaign">选择活动</label
    ><select
      id="campaign"
      v-model="selected"
      class="wide"
      data-testid="activity-select"
    >
      <option v-for="a in items" :key="a.id" :value="a.id">{{ a.name }}</option>
      <option v-if="!items.length" value="">当前范围无活动记录</option></select
    ><template v-if="active"
      ><div class="activity-meta">
        <span class="accent">{{ active.type }}</span
        ><span
          >{{ active.dateBasis === "observed-records" ? "记录日期：" : ""
          }}{{ active.start }} → {{ active.end }}</span
        >
      </div>
      <details class="coverage">
        <summary>
          {{active.dateBasis==='observed-records'?'发生记录':'覆盖'}}
          {{
            active.storeIds.length
              ? active.coveredStores + " 家门店"
              : active.coverageLabel || "未配置"
          }}
          · 查看列表
        </summary>
        <p>
          {{ covered || "来源未提供覆盖门店，未将计划自动关联到所有门店。" }}
          {{ active.coverageLabel || "" }}
        </p>
      </details>
      <div class="activity-metrics">
        <div>
          <span>{{ active.reportedLabel || "观察期营收" }}</span
          ><b
            >{{
              money(
                active.reportedLabel
                  ? active.reportedAmount
                  : active.observedRevenue,
                true,
              )
            }}<small>元</small></b
          >
        </div>
        <div>
          <span>{{ active.reportedLabel ? "正常储值单数" : "观察期订单" }}</span
          ><b
            >{{
              number(
                active.reportedLabel ? active.reportedOrders : active.orders,
              )
            }}<small>单</small></b
          >
        </div>
        <div>
          <span>观察期环比</span
          ><b>{{
            delta(active.dateBasis === "observed-records" ? null : active.mom)
          }}</b>
        </div>
        <div>
          <span>核销率</span><b>{{ percent(active.redemption) }}</b>
        </div>
        <div>
          <span>归因营收增量</span><b>{{ money(active.increment, true) }}</b>
        </div>
        <div>
          <span>ROI</span
          ><b>{{ active.roi == null ? "未配置" : number(active.roi, 2) }}</b>
        </div>
      </div>
      <div class="phase-chart">
        <v-chart
          :option="displayedOption"
          autoresize
          aria-label="活动前中后观察窗口营收"
        />
      </div>
      <p class="micro">
        {{
          active.dateBasis === "observed-records"
            ? "趋势为正常储值实付，单列且不计营收；记录日期不等于计划起止日期。"
            : "前/中/后使用独立窗口，继承门店范围；时长不同。环比为等长前期观察变化，不能解释为活动因果效果。"
        }}{{ active.attributionMethod || "成本与归因口径未配置。" }}
      </p></template
    >
    <p v-else class="empty">没有符合日期与门店范围的活动。</p></Panel
  >
</template>
