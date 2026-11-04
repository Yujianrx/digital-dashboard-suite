<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import Panel from "./Panel.vue";
import { delta, money } from "../format";

interface PerformanceRow {
  id: string;
  name: string;
  revenue: number | null;
  mom: number | null;
}
const props = defineProps<{ rows: PerformanceRow[] }>();
const emit = defineEmits<{ select: [id: string] }>();
const topRows = computed(() =>
  props.rows.filter((row) => Number.isFinite(row.revenue)).slice(0, 20),
);
const rankingKey = computed(() =>
  JSON.stringify(topRows.value.map((row) => [row.id, row.revenue, row.mom])),
);
const viewport = ref<HTMLElement>(),
  shouldScroll = ref(false),
  paused = ref(false),
  reducedMotion = ref(false);
const playing = computed(
  () => shouldScroll.value && !paused.value && !reducedMotion.value,
);
let resizeObserver: ResizeObserver | undefined,
  media: MediaQueryList | undefined;
function measure() {
  const height =
    viewport.value?.querySelector<HTMLElement>(
      ".store-rank-group",
    )?.offsetHeight;
  shouldScroll.value = !!height && height > (viewport.value?.clientHeight || 0);
}
function motionChanged(event: MediaQueryListEvent) {
  reducedMotion.value = event.matches;
}
async function pauseForFocus(event: FocusEvent) {
  paused.value = true;
  await nextTick();
  (event.target as HTMLElement).scrollIntoView({ block: "nearest" });
}
watch(topRows, async () => {
  paused.value = false;
  await nextTick();
  if (viewport.value) viewport.value.scrollTop = 0;
  measure();
});
watch(playing, async (active) => {
  if (active) {
    await nextTick();
    if (viewport.value) viewport.value.scrollTop = 0;
  }
});
onMounted(() => {
  media = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion.value = media.matches;
  media.addEventListener("change", motionChanged);
  resizeObserver = new ResizeObserver(measure);
  if (viewport.value) resizeObserver.observe(viewport.value);
  measure();
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  media?.removeEventListener("change", motionChanged);
});
</script>

<template>
  <Panel title="门店业绩排行" eyebrow="STORE PERFORMANCE" tag="TOP 20">
    <template #actions>
      <button
        v-if="shouldScroll && !reducedMotion"
        class="rank-toggle"
        :aria-label="paused ? '播放门店排行' : '暂停门店排行'"
        :aria-pressed="paused"
        @click="paused = !paused"
      >
        {{ paused ? "播放" : "暂停" }}
      </button>
    </template>
    <div class="store-rank-head" aria-hidden="true">
      <span>排名 / 门店</span><span>营收（元） / 环比</span>
    </div>
    <div
      ref="viewport"
      class="store-rank-viewport"
      :class="{ 'is-manual': !playing }"
      role="region"
      aria-label="门店业绩排行前20"
      data-testid="store-top20"
    >
      <div
        :key="rankingKey"
        class="store-rank-track"
        :class="{ 'is-playing': playing }"
        :style="{ '--rank-duration': `${topRows.length * 2.4}s` }"
      >
        <div
          v-for="copy in playing ? 2 : 1"
          :key="copy"
          class="store-rank-group"
          :aria-hidden="copy === 2 ? true : undefined"
          :data-rank-copy="copy"
          @focusin="copy === 1 && pauseForFocus($event)"
        >
          <button
            v-for="(row, index) in topRows"
            :key="row.id"
            class="store-rank-row"
            :tabindex="copy === 2 ? -1 : 0"
            :title="row.name"
            :data-store-id="row.id"
            :data-revenue="row.revenue"
            @mousedown.prevent
            @click="emit('select', row.id)"
          >
            <span class="store-rank-number" :class="{ podium: index < 3 }">
              {{ String(index + 1).padStart(2, "0") }}
            </span>
            <span class="store-rank-name">{{ row.name }}</span>
            <span class="store-rank-values">
              <strong>{{ money(row.revenue) }}</strong>
              <small
                :class="
                  row.mom == null
                    ? 'muted'
                    : row.mom >= 0
                      ? 'positive'
                      : 'negative'
                "
                >{{ delta(row.mom) }}</small
              >
            </span>
          </button>
        </div>
      </div>
      <p v-if="!topRows.length" class="empty">当前范围暂无门店营收记录</p>
    </div>
    <p class="store-rank-note">
      {{
        playing
          ? "按当前范围总营收排序 · 悬停暂停"
          : paused
            ? "已暂停 · 可手动滚动查看"
            : `按当前范围总营收排序 · 共${topRows.length}家`
      }}
    </p>
  </Panel>
</template>

<style scoped>
:deep(.panel-body) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rank-toggle {
  flex: 0 0 auto;
  color: #8cccf6;
  font-size: 10px;
  padding: 3px 7px;
  border: 1px solid #315975;
  border-radius: 4px;
}
.store-rank-head {
  display: flex;
  justify-content: space-between;
  flex: 0 0 25px;
  color: #7e9eb5;
  font-size: 10px;
  border-bottom: 1px solid #284557;
}
.store-rank-viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.store-rank-viewport.is-manual {
  overflow-y: auto;
}
.store-rank-track.is-playing {
  animation: store-rank-scroll var(--rank-duration) linear infinite;
  will-change: transform;
}
.store-rank-viewport:hover .store-rank-track {
  animation-play-state: paused;
}
.store-rank-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 100px;
  align-items: center;
  column-gap: 7px;
  width: 100%;
  height: 48px;
  padding: 0;
  text-align: left;
  border-bottom: 1px solid #24425766;
}
.store-rank-row:hover,
.store-rank-row:focus-visible {
  background: #1c426044;
}
.store-rank-number {
  font:
    13px Consolas,
    monospace;
  color: #6d96b0;
}
.store-rank-number.podium {
  color: #efbd72;
}
.store-rank-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.5;
  color: #b9d2e5;
}
.store-rank-values {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  font-variant-numeric: tabular-nums;
}
.store-rank-values strong {
  color: #bde2fb;
  font-size: 13px;
  font-weight: 500;
}
.store-rank-values small {
  font-size: 10px;
}
.store-rank-note {
  flex: 0 0 auto;
  margin: 9px 0 0;
  color: #698ca6;
  font-size: 9px;
  line-height: 1.4;
}
@keyframes store-rank-scroll {
  to {
    transform: translateY(-50%);
  }
}
</style>
