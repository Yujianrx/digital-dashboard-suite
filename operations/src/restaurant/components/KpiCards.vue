<script setup lang="ts">
import { money, number, percent, delta } from "../format";
import { thresholds } from "../config";
defineProps<{ items: any[] }>();
const state = (a: number | null) =>
  a == null
    ? "unconfigured"
    : a >= thresholds.achieved
      ? "achieved"
      : a >= thresholds.warning
        ? "warning"
        : "behind";
const stateLabel = (a: number | null) =>
  a == null
    ? "目标未配置"
    : a >= thresholds.achieved
      ? "已达成"
      : a >= thresholds.warning
        ? "预警"
        : "未达成";
</script>
<template>
  <div class="kpi-grid">
    <article
      v-for="(k, i) in items"
      :key="k.key"
      class="kpi"
      :data-testid="'kpi-' + k.key"
    >
      <div class="kpi-label">
        <span class="kpi-index">0{{ i + 1 }}</span
        >{{ k.label
        }}<span class="kpi-status" :class="state(k.achievement)">{{
          stateLabel(k.achievement)
        }}</span>
      </div>
      <div class="kpi-value">
        {{
          k.unit === "money"
            ? money(k.value, k.key === "revenue" || k.key === "recharge")
            : number(k.value, k.unit === "turns" ? 2 : 0)
        }}<small>{{
          k.unit === "money" ? "元" : k.unit === "turns" ? "次/桌·日" : "单"
        }}</small>
      </div>
      <div class="kpi-compare">
        <span
          >同比
          <b
            :class="
              k.yoy == null ? 'muted' : k.yoy >= 0 ? 'positive' : 'negative'
            "
            >{{ delta(k.yoy) }}</b
          ></span
        ><span
          >环比
          <b
            :class="
              k.mom == null ? 'muted' : k.mom >= 0 ? 'positive' : 'negative'
            "
            >{{ delta(k.mom) }}</b
          ></span
        >
      </div>
      <div class="target-line">
        <span
          >目标达成 <b>{{ percent(k.achievement) }}</b></span
        >
        <div class="progress">
          <i
            :class="state(k.achievement)"
            :style="{
              width:
                (k.achievement == null
                  ? 0
                  : Math.min(100, Math.max(0, k.achievement * 100))) + '%',
            }"
          ></i>
        </div>
      </div>
      <p v-if="k.key === 'recharge'" class="micro">
        正常储值订单实付 · 不并入营收
      </p>
    </article>
  </div>
</template>
