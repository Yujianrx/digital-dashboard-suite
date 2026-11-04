<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import type { GeoCollection } from "./geometry.mjs";
import type { MapRow, RankingRow } from "./data.mjs";
import {
  createMapScene,
  type SceneLabel,
  type SceneStats,
  type SceneHover,
} from "./scene";
import { money, number } from "@/restaurant/format";
const props = defineProps<{
  geo: GeoCollection;
  rows: MapRow[];
  ranking: RankingRow[];
}>();
const emit = defineEmits<{
  drill: [type: string, id: string];
  failure: [message: string];
}>();
const host = ref<HTMLElement>();
const instanceId = performance.now().toFixed(3);
const labels = ref<SceneLabel[]>([]),
  hover = ref<SceneHover | null>(null);
const stats = ref<SceneStats>({
  fps: 0,
  regions: 0,
  vertices: 0,
  triangles: 0,
  calls: 0,
  renderMs: 0,
  frameIntervalMs: 0,
});
let scene: ReturnType<typeof createMapScene> | undefined;
function initialize() {
  scene?.dispose();
  scene = undefined;
  if (!host.value) return;
  try {
    scene = createMapScene(host.value, props.geo, {
      hover: (row) => (hover.value = row),
      select: (type, id) => emit("drill", type, id),
      labels: (rows) => (labels.value = rows),
      stats: (value) => (stats.value = value),
      failure: (message) => emit("failure", message),
    });
    scene.setMetrics(props.rows, props.ranking);
  } catch {
    emit("failure", "当前设备无法初始化三维地图，已切换到业务网络");
  }
}
onMounted(initialize);
watch(() => props.geo, initialize);
watch(
  () => props.rows,
  () => scene?.setMetrics(props.rows, props.ranking),
);
onBeforeUnmount(() => scene?.dispose());
defineExpose({
  resetView: () => scene?.resetView(),
  benchmark: () => scene?.benchmark(),
});
</script>
<template>
  <div
    class="map3d"
    data-testid="map3d"
    :data-instance="instanceId"
    :data-fps="stats.fps"
    :data-regions="stats.regions"
    :data-vertices="stats.vertices"
    :data-triangles="stats.triangles"
    :data-draw-calls="stats.calls"
    :data-render-ms="stats.renderMs"
    :data-frame-interval="stats.frameIntervalMs"
    :data-benchmark-state="stats.benchmarkState || 'idle'"
    :data-benchmark-fps="stats.benchmarkFps || 0"
    :data-benchmark-frames="stats.benchmarkFrames || 0"
  >
    <div class="map3d-canvas" ref="host"></div>
    <svg class="map3d-callouts" aria-hidden="true">
      <line
        v-for="label in labels"
        :key="label.id"
        :x1="label.anchorX"
        :y1="label.anchorY"
        :x2="label.x"
        :y2="label.y"
      />
    </svg>
    <div class="map3d-labels" aria-label="地图重点区域">
      <button
        v-for="label in labels"
        :key="label.id"
        :style="{ left: label.x + 'px', top: label.y + 'px' }"
        :data-testid="'map-label-' + label.id"
        :disabled="!label.selectionId"
        @click="
          label.selectionId &&
          emit('drill', label.selectionType, label.selectionId)
        "
      >
        <strong>{{ label.name }}</strong
        ><span>{{ money(label.revenue, true) }}元</span>
      </button>
    </div>
    <div class="map3d-hint">拖动旋转 · 滚轮缩放 · 点击下钻</div>
    <div v-if="hover" class="map3d-tooltip" role="status">
      <strong>{{ hover.name }}</strong
      ><span
        >营收 {{ money(hover.revenue, true) }}元 ·
        {{ number(hover.orders) }}单</span
      >
      <small
        >{{ hover.storeCount }}家目录门店<span v-if="hover.ambiguous">
          · 名称对应多个数据库值，请使用筛选</span
        ></small
      >
    </div>
  </div>
</template>
<style scoped>
.map3d,
.map3d-canvas,
.map3d-labels {
  position: absolute;
  inset: 0;
}
.map3d {
  z-index: 3;
  overflow: hidden;
}
.map3d-labels {
  pointer-events: none;
}
.map3d-callouts {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.map3d-callouts line {
  stroke: #59b8bd;
  stroke-width: 0.7;
  opacity: 0.4;
}
.map3d-labels button {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 3px 7px;
  border: 1px solid #66bdf14d;
  background: #071b2dc9;
  border-radius: 3px;
  color: #cdf5ec;
  font-size: 9px;
  white-space: nowrap;
  pointer-events: auto;
  box-shadow: 0 2px 14px #01101e99;
  text-align: center;
}
.map3d-labels strong,
.map3d-labels span {
  display: block;
  font-weight: 400;
  line-height: 1.4;
}
.map3d-labels span {
  color: #91d1fa;
  font-size: 10px;
  font-family: Consolas, monospace;
}
.map3d-labels button:focus-visible {
  outline: 2px solid #ffcb79;
}
.map3d-hint {
  position: absolute;
  bottom: 5px;
  left: 12px;
  color: #628d9e;
  font-size: 9px;
  pointer-events: none;
}
.map3d-tooltip {
  position: absolute;
  bottom: 22px;
  right: 12px;
  display: grid;
  gap: 4px;
  max-width: 75%;
  padding: 9px 12px;
  background: #061c2df2;
  border: 1px solid #3e998b;
  border-radius: 4px;
  font-size: 11px;
  pointer-events: none;
  box-shadow: 0 4px 20px #0008;
}
.map3d-tooltip strong {
  font-size: 13px;
  color: #a8dcff;
}
.map3d-tooltip span {
  color: #c3dee6;
}
.map3d-tooltip small {
  color: #81a5b6;
  font-size: 9px;
}
</style>
