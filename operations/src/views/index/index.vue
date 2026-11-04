<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from "vue";
import CenterMap from "./center-map.vue";
import Panel from "@/restaurant/components/Panel.vue";
import KpiCards from "@/restaurant/components/KpiCards.vue";
import ChannelPanel from "@/restaurant/components/ChannelPanel.vue";
import ActivityPanel from "@/restaurant/components/ActivityPanel.vue";
import MemberPanel from "@/restaurant/components/MemberPanel.vue";
import StorePerformancePanel from "@/restaurant/components/StorePerformancePanel.vue";
import RankingPanel from "@/restaurant/components/RankingPanel.vue";
import {
  loadDataset,
  loadSnapshotStatus,
  type DataSource,
} from "@/restaurant/adapter";
import type { Dataset, Filters, SnapshotStatus } from "@/restaurant/types";
import {
  defaults,
  deriveDashboard,
  dates,
  validateDataset,
  shanghaiToday,
  addDays,
} from "@/restaurant/model.mjs";
import { trendOption } from "@/restaurant/chart";
import { refreshSeconds } from "@/restaurant/config";
const filters = reactive<Filters>(defaults()),
  draft = reactive({ start: filters.start, end: filters.end }),
  data = shallowRef<Dataset | null>(null),
  source = ref<DataSource | "import">("demo"),
  loading = ref(false),
  error = ref(""),
  rules = ref<HTMLDialogElement | null>(null),
  bottomTab = ref("trend"),
  auto = ref(true),
  snapshotState = ref<SnapshotStatus | null>(null),
  updated = ref(""),
  clock = ref(""),
  imported = ref<Dataset | null>(null);
let datePreset: "month" | "week" | "custom" = "month";
let controller: AbortController | undefined,
  sequence = 0,
  timer: ReturnType<typeof setInterval> | undefined,
  refreshTimer: ReturnType<typeof setInterval> | undefined;
const committedFilters = ref<Filters>({ ...filters });
const calculationFilters = computed(() =>
  source.value === "clickhouse" ? committedFilters.value : filters,
);
const summary = computed(() =>
  data.value ? deriveDashboard(data.value, calculationFilters.value) : null,
);
const regions = computed(() =>
  data.value
    ? [
        ...new Map(
          data.value.stores.map((s) => [
            s.regionId,
            { id: s.regionId, name: s.regionName },
          ]),
        ).values(),
      ]
    : [],
);
const provinces = computed(() =>
  data.value
    ? [
        ...new Set(
          data.value.stores
            .filter((s) => !filters.regionId || s.regionId === filters.regionId)
            .map((s) => s.province),
        ),
      ]
    : [],
);
const cities = computed(() =>
  data.value
    ? [
        ...new Set(
          data.value.stores
            .filter(
              (s) =>
                (!filters.regionId || s.regionId === filters.regionId) &&
                (!filters.province || s.province === filters.province),
            )
            .map((s) => s.city),
        ),
      ]
    : [],
);
const storeOptions = computed(
  () =>
    data.value?.stores.filter(
      (s) =>
        (!filters.regionId || s.regionId === filters.regionId) &&
        (!filters.province || s.province === filters.province) &&
        (!filters.city || s.city === filters.city),
    ) || [],
);
const regionName = computed(
  () => regions.value.find((r) => r.id === filters.regionId)?.name,
);
const storeName = computed(
  () => data.value?.stores.find((s) => s.id === filters.storeId)?.name,
);
const chart = computed(() => trendOption(summary.value?.trend || [], true));
const signalName = computed(() =>
  data.value?.meta.mode === "demo"
    ? "尚未接入数据 · 空模板"
    : "真实模式 · " +
      (source.value === "clickhouse" ? "本地每日快照" : "静态快照"),
);
const maxDataDate = computed(() =>
  source.value === "clickhouse"
    ? snapshotState.value?.asOf || defaults().end
    : shanghaiToday(),
);
const snapshotNotice = computed(() =>
  snapshotState.value?.syncing
    ? "同步中 · 使用上次快照"
    : snapshotState.value?.lastError
      ? "同步失败 · 保留上次快照"
      : "每天10:00同步 · 点击只读本地",
);
const synchronizedAt = computed(() => {
  const value = data.value?.meta.snapshot?.completedAt;
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "";
});
async function load() {
  const ticket = ++sequence;
  const requested = { ...filters };
  controller?.abort();
  controller = new AbortController();
  error.value = "";
  loading.value = true;
  try {
    if (source.value === "clickhouse") {
      const status = await loadSnapshotStatus(controller.signal);
      if (ticket !== sequence) return;
      snapshotState.value = status;
      if (status.ready && status.asOf && datePreset !== "custom") {
        const end = status.asOf;
        const start =
          datePreset === "month" ? end.slice(0, 7) + "-01" : addDays(end, -6);
        if (requested.start !== start || requested.end !== end) {
          Object.assign(requested, { start, end });
          Object.assign(filters, { start, end });
          Object.assign(draft, { start, end });
        }
      }
    }
    const next =
      source.value === "import"
        ? imported.value
        : await loadDataset(source.value, controller.signal, requested);
    if (ticket !== sequence) return;
    if (!next) throw Error("请先导入有效 JSON 数据包");
    committedFilters.value = requested;
    data.value = next;
    updated.value = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
    if (
      filters.regionId &&
      !next.stores.some((s) => s.regionId === filters.regionId)
    )
      resetScope();
  } catch (e) {
    if (ticket === sequence && (e as Error).name !== "AbortError") {
      error.value = (e as Error).message;
      data.value = null;
    }
  } finally {
    if (ticket === sequence) loading.value = false;
  }
}
function resetScope() {
  Object.assign(filters, { regionId: "", province: "", city: "", storeId: "" });
}
function drill(type: string, id: string) {
  if (type === "regionId")
    Object.assign(filters, {
      regionId: id,
      province: "",
      city: "",
      storeId: "",
    });
  else if (type === "province")
    Object.assign(filters, { province: id, city: "", storeId: "" });
  else if (type === "city") Object.assign(filters, { city: id, storeId: "" });
  else if (type === "storeId") {
    const s = data.value?.stores.find((s) => s.id === id);
    if (s)
      Object.assign(filters, {
        regionId: s.regionId,
        province: s.province,
        city: s.city,
        storeId: id,
      });
  }
}
function back() {
  if (filters.storeId) filters.storeId = "";
  else if (filters.city) filters.city = "";
  else if (filters.province) filters.province = "";
  else filters.regionId = "";
}
async function applyDates(
  period: "month" | "range" = "range",
  preset: "month" | "week" | "custom" = "custom",
) {
  try {
    dates(draft.start, draft.end);
    if (draft.end > shanghaiToday())
      throw Error("结束日期不能晚于上海时区今天");
    datePreset = preset;
    if (
      source.value === "clickhouse" &&
      snapshotState.value?.asOf &&
      draft.end > snapshotState.value.asOf
    )
      throw Error(
        "本地快照截至" + snapshotState.value.asOf + "，请选择已同步日期",
      );
    Object.assign(filters, { start: draft.start, end: draft.end, period });
    error.value = "";
    if (source.value !== "demo" && source.value !== "import") await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function changeMode() {
  resetScope();
  await load();
}
async function quick(type: string) {
  const end =
    source.value === "clickhouse"
      ? snapshotState.value?.asOf || addDays(shanghaiToday(), -1)
      : addDays(shanghaiToday(), -1);
  Object.assign(draft, {
    end,
    start: type === "month" ? end.slice(0, 7) + "-01" : addDays(end, -6),
  });
  await applyDates(
    type === "month" ? "month" : "range",
    type === "month" ? "month" : "week",
  );
}
async function importJson(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  controller?.abort();
  sequence++;
  data.value = null;
  loading.value = false;
  error.value = "";
  try {
    if (file.size > 25 * 1024 * 1024) throw Error("JSON 文件请控制在25MB内");
    const next = validateDataset(JSON.parse(await file.text()));
    imported.value = next;
    source.value = "import";
    resetScope();
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
  input.value = "";
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    error.value = "当前预览环境不支持全屏，可在独立浏览器打开";
  }
}
function updateClock() {
  clock.value = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}
watch(
  () => [filters.regionId, filters.province, filters.city, filters.storeId],
  () => {
    if (source.value === "clickhouse") load();
  },
);
onMounted(() => {
  load();
  updateClock();
  timer = setInterval(updateClock, 1000);
  refreshTimer = setInterval(() => {
    if (auto.value && !loading.value) load();
  }, refreshSeconds * 1000);
});
onBeforeUnmount(() => {
  controller?.abort();
  clearInterval(timer);
  clearInterval(refreshTimer);
});
</script>
<template>
  <main class="dashboard">
    <div class="ambient" aria-hidden="true">
      <i
        v-for="n in 18"
        :key="n"
        :style="{
          left: ((n * 37) % 100) + '%',
          top: ((n * 19) % 100) + '%',
          animationDelay: -n + 's',
        }"
      ></i>
    </div>
    <header class="masthead">
      <div class="brand-block">
        <div class="brand-lockup">
          <span class="brand-kicker">CHAIN OPERATIONS</span>
          <h1>连锁经营<span>数据大屏</span></h1>
        </div>
      </div>
      <div class="head-center">
        <span
          class="status-pill"
          :class="{ real: data?.meta.mode === 'real' }"
          data-testid="mode-badge"
          ><i class="dot"></i>{{ data ? signalName : "等待数据源" }}</span
        ><span class="head-line"></span
        ><small data-testid="snapshot-status">{{
          source === "clickhouse" ? snapshotNotice : "经营分析 / 管理汇报"
        }}</small>
      </div>
      <div class="head-tools">
        <time>{{ clock }}</time
        ><button
          class="icon-btn"
          @click="rules?.showModal()"
          aria-label="查看指标口径"
          data-testid="open-rules"
        >
          ⓘ</button
        ><button class="icon-btn" @click="fullscreen" aria-label="切换全屏">
          ⛶
        </button>
      </div>
    </header>
    <form class="filterbar" @submit.prevent="applyDates('range')">
      <div class="date-controls">
        <label
          >统计日期<input
            type="date"
            v-model="draft.start"
            aria-label="开始日期"
            :max="maxDataDate" /></label
        ><span class="muted">—</span
        ><input
          type="date"
          v-model="draft.end"
          aria-label="结束日期"
          :max="maxDataDate"
        /><button class="primary" type="submit" data-testid="apply-dates">
          应用</button
        ><button type="button" class="ghost compact" @click="quick('month')">
          本月</button
        ><button type="button" class="ghost compact" @click="quick('7')">
          前7天
        </button>
      </div>
      <div class="scope-controls">
        <select
          v-model="filters.regionId"
          @change="
            filters.province = '';
            filters.city = '';
            filters.storeId = '';
          "
          aria-label="业务大区"
          data-testid="region-filter"
        >
          <option value="">全部大区</option>
          <option v-for="r in regions" :key="r.id" :value="r.id">
            {{ r.name }}
          </option></select
        ><select
          v-model="filters.province"
          @change="
            filters.city = '';
            filters.storeId = '';
          "
          aria-label="省份"
        >
          <option value="">全部省份</option>
          <option v-for="p in provinces" :key="p">{{ p }}</option></select
        ><select
          v-model="filters.city"
          @change="filters.storeId = ''"
          aria-label="城市"
        >
          <option value="">全部城市</option>
          <option v-for="c in cities" :key="c">{{ c }}</option></select
        ><select
          v-model="filters.storeId"
          aria-label="门店"
          class="store-filter"
        >
          <option value="">全部门店</option>
          <option v-for="s in storeOptions" :key="s.id" :value="s.id">
            {{ s.name }}
          </option>
        </select>
      </div>
      <div class="source-controls">
        <select
          v-model="source"
          @change="changeMode"
          aria-label="数据源"
          data-testid="source-select"
        >
          <option value="demo">空数据模板</option>

          <option value="clickhouse">真实数据 · 每日快照</option>
          <option value="static">静态真实 JSON</option>
          <option v-if="imported" value="import">已导入 JSON</option></select
        ><label class="upload-button" title="导入契约JSON"
          >导入<input
            type="file"
            accept=".json,application/json"
            @change="importJson"
            aria-label="导入 JSON 数据" /></label
        ><button
          type="button"
          class="icon-btn"
          @click="load"
          :disabled="loading"
          aria-label="刷新数据"
          data-testid="refresh"
          title="重新读取本地数据，不触发数据库同步"
        >
          ↻
        </button>
      </div>
    </form>
    <div class="contextline">
      <nav aria-label="下钻路径" class="breadcrumbs">
        <button @click="resetScope" data-testid="scope-root">全国</button
        ><span v-if="regionName">/ {{ regionName }}</span
        ><span v-if="filters.province">/ {{ filters.province }}</span
        ><span v-if="filters.city">/ {{ filters.city }}</span
        ><b v-if="storeName">/ {{ storeName }}</b>
      </nav>
      <div class="compare-controls">
        <span>{{ filters.start }} 至 {{ filters.end }}</span
        ><label
          >环比<select
            v-model="filters.compareMode"
            @change="applyDates(filters.period || 'month')"
            aria-label="环比基期"
          >
            <option value="last-month">上月同期</option>
            <option value="previous-period">前一等长周期</option>
          </select></label
        ><span v-if="summary"
          >基期 {{ summary.windows.previous.start }} —
          {{ summary.windows.previous.end }}</span
        >
      </div>
    </div>
    <div v-if="error" class="error-banner" role="alert" data-testid="error">
      {{ error }}<button @click="load">重试</button>
    </div>
    <div v-if="loading && !data" class="loading-state" role="status">
      正在读取数据源与校验口径…
    </div>
    <div v-if="data && summary" class="data-shell" :aria-busy="loading">
      <div v-if="loading" class="data-refresh-overlay" role="status">
        正在读取所选范围，暂显示上次已校验结果…
      </div>
      <KpiCards :items="summary.kpis" />
      <div v-if="summary.current.partial" class="partial-banner">
        当前数据有缺失字段，已知值合计不代表完整期间；客单价、占比和目标进度按可验证条件显示。
      </div>
      <div class="main-grid">
        <ChannelPanel :summary="summary" class="channels-panel" /><CenterMap
          :data="data"
          :summary="summary"
          :filters="calculationFilters"
          @drill="drill"
          @back="back"
        /><ActivityPanel
          :items="summary.activities"
          :stores="data.stores"
          class="activities-panel"
        /><MemberPanel :member="summary.member" class="members-panel" />
        <div class="center-bottom">
          <div class="tabs" role="tablist" aria-label="趋势与门店排行">
            <button
              role="tab"
              :aria-selected="bottomTab === 'trend'"
              :class="{ active: bottomTab === 'trend' }"
              @click="bottomTab = 'trend'"
            >
              分渠道营业趋势</button
            ><button
              role="tab"
              :aria-selected="bottomTab === 'rank'"
              :class="{ active: bottomTab === 'rank' }"
              @click="bottomTab = 'rank'"
              data-testid="rank-tab"
            >
              门店营收排行
            </button>
          </div>
          <Panel
            v-if="bottomTab === 'trend'"
            title="分渠道营业趋势"
            eyebrow="CHANNEL TRENDS"
            :tag="filters.start + ' → ' + filters.end"
            ><div class="trend-chart">
              <v-chart
                :option="chart"
                autoresize
                aria-label="分渠道每日营收趋势"
              /></div></Panel
          ><RankingPanel
            v-else
            :rows="summary.ranking"
            @select="drill('storeId', $event)"
          />
        </div>
        <StorePerformancePanel
          :rows="summary.ranking"
          class="performance-ranking-panel"
          @select="drill('storeId', $event)"
        />
      </div>
      <footer class="dashboard-footer">
        <span
          ><i class="dot"></i>{{ data.meta.source }}
          <b class="muted">|</b> 上海时区 ·
          {{
            synchronizedAt
              ? "上次同步 " + synchronizedAt
              : "页面读取 " + updated
          }}</span
        ><span
          >{{ data.meta.freshness
          }}<label class="auto-refresh"
            ><input type="checkbox" v-model="auto" />每
            {{ refreshSeconds / 60 }}
            {{
              source === "clickhouse" ? "分钟检查本地快照" : "分钟刷新"
            }}</label
          ><button @click="rules?.showModal()">口径与数据质量 ↗</button></span
        >
      </footer>
    </div>
    <div v-else-if="!loading && !error" class="empty">请选择数据源。</div>
    <dialog ref="rules" class="rules-dialog" aria-labelledby="rules-title">
      <header>
        <div>
          <span class="panel-eyebrow">DEFINITIONS & PROVENANCE</span>
          <h2 id="rules-title">指标口径与数据质量</h2>
        </div>
        <button
          class="icon-btn"
          @click="rules?.close()"
          aria-label="关闭口径说明"
        >
          ×
        </button>
      </header>
      <div class="rules-content">
        <p><b>来源：</b>{{ data?.meta.source || "暂无数据" }}</p>
        <p><b>营收定义：</b>{{ data?.meta.revenueDefinition || "尚未加载" }}</p>
        <p>
          <b>源时间：</b>{{ data?.meta.generatedAt }}；<b>覆盖日期：</b
          >{{ data?.meta.coverage.start }} —
          {{ data?.meta.coverage.end }}。覆盖范围不保证每日完整。
        </p>
        <ul>
          <li v-for="w in data?.meta.warnings" :key="w">{{ w }}</li>
        </ul>
        <h3>每日快照</h3>
        <p>
          每天北京时间10:00集中同步真实数据，页面筛选与刷新只读本地。同步失败保留上次已校验快照并显示时间；错过10点后，下次启动补同步。余额为同步时快照，不能作为实时余额。首次初始化或管理员显式同步命令可立即拉取数据库。
        </p>
        <h3>经营与比较</h3>
        <p>
          客单价 = 当前范围营收合计 ÷
          有效订单合计，仅两项都完整时计算。储值总额按所选日期和门店的正常储值订单实付汇总，单列且不并入营业收入。营收与订单目标必须覆盖所选全部门店和业务日；缺项显示未配置。
        </p>
        <p>
          默认统计到上海时区昨天，初次进入为昨天所在自然月。环比可选上月同期（按月末夹取）或前一等长周期；同比为去年对应公历区间，闰日无对应日则不计算。基期为0或缺录均不产生百分比。非完整覆盖不能当作完整业绩。
        </p>
        <h3>活动与渠道</h3>
        <p>
          活动观察营收按覆盖门店与所选日期的活动交集计算。环比仅为等长前期观察变化。归因营收增量须有经确认的归因方法与完整作用范围；ROI
          = 已归因毛利 ÷ 活动成本（本交付默认未配置）。核销率 =
          同一统计口径核销数 ÷ 发放数，分母缺失不计算。真实口径若不同应替换。
        </p>
        <p>
          四渠道使用单一互斥渠道映射。同一订单只进入一个渠道；来源与场景存在交叉时先确认优先级。未知编码单列，不隐藏，也不重复计入。
        </p>
        <h3>会员、毛利与地图</h3>
        <p>
          会员总数按结束日前创建的档案ID去重，新增档案与新增注册分别按创建日、注册日统计。门店会员资产按首次交易门店归属，消费按实际消费门店。新老客使用本期储值消费会员的数据库标签，去重后新客优先；复购为期内至少两单会员占比。余额为当前档案快照，并非所选历史期末余额。菜品成本与套餐拆分仍待核实。
        </p>
        <p>
          当前开发模式提供三维省市地图预览，经营数值使用真实数据库；正式地图资源尚待来源、使用许可、审图与完整性验收。未配置已验收地图时，正式构建使用业务网络。门店精确经纬度尚未接入，城市轮廓中心仅表达汇总范围。
        </p>
      </div>
      <button class="primary" @click="rules?.close()">关闭</button>
    </dialog>
  </main>
</template>
