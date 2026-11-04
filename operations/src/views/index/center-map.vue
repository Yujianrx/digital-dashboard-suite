<script setup lang="ts">
import { sha256Text } from "@/restaurant/hash.mjs";
import {
  computed,
  onMounted,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
  defineAsyncComponent,
} from "vue";
import {
  validateMapAsset,
  validateMapGeometry,
} from "@/restaurant/map-assets.mjs";
import {
  administrativeName,
  buildMapRows,
  coordinateCoverage,
} from "./map3d/data.mjs";
import type { GeoCollection } from "./map3d/geometry.mjs";
const Map3D = defineAsyncComponent(() => import("./map3d/Map3D.vue"));
import type { Dataset, Filters, MapAsset } from "@/restaurant/types";
import { money, number, delta } from "@/restaurant/format";

const props = defineProps<{ data: Dataset; filters: Filters; summary: any }>();
const emit = defineEmits<{ drill: [type: string, id: string]; back: [] }>();
type Asset = MapAsset & {
  adcode?: string;
  developmentOnly?: boolean;
  level?: "province" | "city";
  sha256?: string;
};
const allowPreviewMaps =
  import.meta.env.DEV || import.meta.env.MODE === "local-board";
const assets = ref<Asset[]>([]),
  previews = ref<Asset[]>([]);
const geoData = shallowRef<GeoCollection | null>(null),
  activeAsset = shallowRef<Asset | null>(null);
const mapNotice = ref("正在准备三维地图资源"),
  mapLoading = ref(false),
  mode = ref<"3d" | "network">(
    localStorage.getItem("restaurant.mapView") === "network" ? "network" : "3d",
  );
const mapRef = ref<{ resetView: () => void; benchmark: () => void }>();
const showPerformanceControls =
  import.meta.env.DEV && new URLSearchParams(location.search).has("perf");
const geometryCache = new Map<string, GeoCollection>();
const key = computed(() => props.filters.province || "china");
const mapField = computed(
  () =>
    activeAsset.value?.level || (key.value === "china" ? "province" : "city"),
);
const mapRows = computed(() =>
  buildMapRows(
    geoData.value,
    props.summary.ranking,
    mapField.value,
    activeAsset.value?.nameMap,
  ),
);
const coverage = computed(() => coordinateCoverage(props.summary.ranking));
const unmatched = computed(() => {
  const ids = new Set(mapRows.value.flatMap((row) => row.matchedStoreIds));
  return props.summary.ranking.filter((row: any) => !ids.has(row.id));
});
let mapRequest = 0,
  controller: AbortController | undefined;
function matchAsset(asset: Asset) {
  if (key.value === "china") return asset.key === "china";
  const provinceCode = props.data.stores.find(
    (s) => s.province === key.value,
  )?.provinceCode;
  return (
    administrativeName(asset.key) === administrativeName(key.value) ||
    (!!provinceCode &&
      (asset.adcode === provinceCode || asset.key === provinceCode))
  );
}
async function loadMap() {
  const ticket = ++mapRequest;
  controller?.abort();
  controller = new AbortController();
  geoData.value = null;
  activeAsset.value = null;
  mapLoading.value = true;
  const asset =
    assets.value.find(matchAsset) ||
    (allowPreviewMaps ? previews.value.find(matchAsset) : undefined);
  if (!asset) {
    mapNotice.value = "暂无已验收地图资源 · 使用业务层级网络";
    mapLoading.value = false;
    mode.value = "network";
    return;
  }
  try {
    const cacheKey = asset.url + ":" + (asset.sha256 || "");
    let geo = geometryCache.get(cacheKey);
    if (!geo) {
      const response = await fetch(import.meta.env.BASE_URL + asset.url, {
        signal: controller.signal,
      });
      if (!response.ok) throw Error("地图资源读取失败");
      const body = await response.text();
      if (asset.sha256) {
        const hash = await sha256Text(body);
        if (hash !== asset.sha256) throw Error("地图文件完整性校验失败");
      }
      geo = JSON.parse(body);
      if (asset.developmentOnly) {
        if (!allowPreviewMaps) throw Error("预览地图仅可用于本地开发");
        validateMapGeometry(asset, geo);
      } else validateMapAsset(asset, geo);
      geometryCache.set(cacheKey, geo!);
    }
    if (ticket !== mapRequest) return;
    activeAsset.value = asset;
    geoData.value = geo!;
    mapNotice.value = asset.developmentOnly
      ? "开发预览 · 来源：阿里云 DataV GeoAtlas · 地图授权、审图与完整性待验收"
      : `地图来源：${asset.source} · ${asset.reviewNumber}`;
  } catch (error) {
    if (ticket === mapRequest) {
      mapNotice.value = (error as Error).message + " · 已切换到业务网络";
      mode.value = "network";
    }
  } finally {
    if (ticket === mapRequest) mapLoading.value = false;
  }
}
onMounted(async () => {
  async function manifest(path: string) {
    try {
      const r = await fetch(import.meta.env.BASE_URL + path);
      if (!r.ok) return [];
      return (await r.json()).assets || [];
    } catch {
      return [];
    }
  }
  const [approved, preview] = await Promise.all([
    manifest("maps/manifest.json"),
    allowPreviewMaps
      ? manifest("maps/preview/manifest.json")
      : Promise.resolve([]),
  ]);
  assets.value = approved.filter((a: Asset) => !a.developmentOnly);
  previews.value = preview.filter((a: Asset) => a.developmentOnly);
  await loadMap();
});
watch(key, loadMap);
onBeforeUnmount(() => {
  mapRequest++;
  controller?.abort();
});
function selectView(value: "3d" | "network") {
  mode.value = value;
  localStorage.setItem("restaurant.mapView", value);
  if (value === "3d" && !geoData.value) void loadMap();
}
function mapFailure(message: string) {
  mapNotice.value = message;
  mode.value = "network";
}
const nodes = computed(() => {
  if (mode.value === "3d" && geoData.value)
    return mapRows.value
      .filter((r) => r.selectionId)
      .map((r) => ({
        id: r.selectionId!,
        name: r.name,
        type: r.selectionType,
        value: r.revenue,
        sub: r.storeCount + " 家门店",
      }));
  const s = props.summary.stores,
    rows = props.summary.ranking;
  if (props.filters.province)
    return rows.slice(0, 12).map((r: any) => ({
      id: r.id,
      name: r.name.replace(/^示例·/, ""),
      type: "storeId",
      value: r.revenue,
      sub: r.city,
    }));
  const field = props.filters.regionId ? "province" : "regionId";
  const ids = [...new Set(s.map((r: any) => r[field]))];
  return ids.map((id) => {
    const group = rows.filter((r: any) => r[field] === id),
      known = group.filter((r: any) => r.revenue != null);
    return {
      id,
      name: field === "province" ? id : group[0]?.regionName,
      type: field,
      value: known.length
        ? known.reduce((v: number, r: any) => v + r.revenue, 0)
        : null,
      sub: group.length + " 家门店",
    };
  });
});
const option = computed(() => {
  const count = nodes.value.length,
    center = {
      name: "__center",
      x: 450,
      y: 230,
      symbolSize: 110,
      itemStyle: {
        color: "#123e4e",
        borderColor: "#45d5bd",
        borderWidth: 2,
        shadowColor: "#29cbbd55",
        shadowBlur: 30,
      },
      label: {
        show: true,
        formatter: props.filters.storeId
          ? "门店经营"
          : props.filters.province || props.data.meta.title + "\n经营网络",
        fontSize: 16,
        color: "#dbfff8",
      },
    };
  return {
    animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    animationDuration: 500,
    tooltip: {
      renderMode: "richText",
      formatter: (p: any) =>
        p.data.name === "__center"
          ? "点击周围节点下钻"
          : `${p.name}\n营收 ${money(p.data.value, true)}元`,
    },
    series: [
      {
        type: "graph",
        layout: "none",
        roam: false,
        left: "12%",
        right: "12%",
        top: "18%",
        bottom: "18%",
        edgeSymbol: ["none", "arrow"],
        edgeSymbolSize: 5,
        lineStyle: { color: "#2b6e81", width: 1.5, curveness: 0.07 },
        data: [
          center,
          ...nodes.value.map((n: any, i: number) => ({
            ...n,
            x: 450 + Math.cos((i / count) * Math.PI * 2 - Math.PI / 2) * 330,
            y: 230 + Math.sin((i / count) * Math.PI * 2 - Math.PI / 2) * 165,
            symbolSize: count > 8 ? 44 : 70,
            itemStyle: {
              color: n.type === "storeId" ? "#154052" : "#13374a",
              borderColor: "#66bdf1",
              borderWidth: 1.5,
              shadowColor: "#66bdf144",
              shadowBlur: 14,
            },
            label: {
              show: true,
              position: "bottom",
              distance: 10,
              formatter: n.name + "\n" + n.sub,
              color: "#a8ccdf",
              fontSize: 11,
            },
          })),
        ],
        links: nodes.value.map((n: any) => ({
          source: "__center",
          target: n.id,
        })),
        emphasis: { focus: "adjacency" },
      },
    ],
  };
});
function click(p: any) {
  if (p.data?.storeId) {
    emit("drill", "storeId", p.data.storeId);
    return;
  }
  const n = nodes.value.find((n: any) => n.name === p.name);
  if (n) {
    emit("drill", n.type, n.id);
    return;
  }
}
</script>
<template>
  <section class="map-module">
    <header class="map-head">
      <div>
        <span class="panel-eyebrow">OPERATING NETWORK</span>
        <h2>
          {{
            filters.storeId
              ? "门店经营聚焦"
              : filters.province
                ? filters.province + " · 门店分布"
                : filters.regionId
                  ? summary.stores[0]?.regionName + " · 省市分布"
                  : "全国经营分布"
          }}
        </h2>
      </div>
      <div class="map-actions">
        <div class="map-view-switch" aria-label="地图视图">
          <button
            @click="selectView('3d')"
            :aria-pressed="mode === '3d'"
            data-testid="map-view-3d"
          >
            3D地图
          </button>
          <button
            @click="selectView('network')"
            :aria-pressed="mode === 'network'"
            data-testid="map-view-network"
          >
            业务网络
          </button>
        </div>
        <button
          v-if="showPerformanceControls"
          class="ghost"
          @click="mapRef?.benchmark()"
          data-testid="map-benchmark"
        >
          性能检测
        </button>
        <button
          class="ghost map-reset"
          @click="mapRef?.resetView()"
          :disabled="mode !== '3d' || !geoData"
          aria-label="复位地图视角"
        >
          复位
        </button>
        <button
          class="ghost"
          @click="emit('back')"
          :disabled="
            !filters.regionId &&
            !filters.province &&
            !filters.city &&
            !filters.storeId
          "
          data-testid="back-level"
        >
          ↶ 返回上级
        </button>
      </div>
    </header>
    <div class="map-stats">
      <span
        ><b>{{ number(summary.stores.length) }}</b> 目录门店 /
        <b>{{
          number(summary.ranking.filter((r: any) => r.revenue != null).length)
        }}</b>
        家有当期记录</span
      ><span
        ><b>{{ money(summary.current.revenue, true) }}</b> 元营收</span
      ><span
        ><b>{{ number(summary.current.orders) }}</b> 单订单</span
      ><span
        >同比 <b>{{ delta(summary.kpis[0].yoy) }}</b> / 环比
        <b>{{ delta(summary.kpis[0].mom) }}</b></span
      >
    </div>
    <div class="network-stage">
      <div class="orbit orbit-one"></div>
      <div class="orbit orbit-two"></div>
      <template v-if="mode === '3d' && geoData">
        <Map3D
          ref="mapRef"
          :geo="geoData"
          :rows="mapRows"
          :ranking="summary.ranking"
          @drill="(type: string, id: string) => emit('drill', type, id)"
          @failure="mapFailure"
        />
        <div class="map-legend">
          <span class="legend-gradient"></span>营收：低 → 高 · 柱高按绝对值<span
            v-if="mapRows.some((r) => r.revenue != null && r.revenue < 0)"
          >
            · 橙色为负值</span
          >
        </div>
        <span v-if="activeAsset?.developmentOnly" class="map-preview-badge"
          >开发预览</span
        >
      </template>
      <div
        v-else-if="mode === '3d' && mapLoading"
        class="map-loading"
        role="status"
      >
        正在加载立体地图…
      </div>
      <v-chart
        v-else
        :option="option"
        autoresize
        @click="click"
        class="network-chart"
        aria-label="可下钻的经营网络图"
      />
    </div>
    <div class="drill-choices" aria-label="可访问的下钻节点">
      <button
        v-for="n in nodes"
        :key="n.id"
        @click="emit('drill', n.type, n.id)"
        :data-testid="'drill-' + n.type + '-' + n.id"
      >
        {{ n.name }} <span>›</span>
      </button>
    </div>
    <div class="map-top-stores">
      <button
        v-for="(r, i) in summary.ranking
          .filter((r: any) => r.revenue != null)
          .slice(0, 3)"
        :key="r.id"
        :title="r.name"
        @click="emit('drill', 'storeId', r.id)"
      >
        <b>TOP {{ Number(i) + 1 }}</b> {{ r.name }}
        <span>{{ money(r.revenue, true) }}元</span>
      </button>
    </div>
    <div class="map-foot" data-testid="map-source-notice">
      <span class="dot amber"></span>{{ mapNotice }}
      <span v-if="mode === '3d'">
        · 精确门店定位 {{ coverage.located.length }}/{{ coverage.total }}</span
      >
      <span v-if="mode === '3d' && unmatched.length">
        · 地图未覆盖 {{ unmatched.length }}家，经营统计保留</span
      >
    </div>
  </section>
</template>
