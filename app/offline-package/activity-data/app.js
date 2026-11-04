/* 会员运营活动效果数据看板：通过共享存储接口保存到主机。 */
(() => {
  "use strict";

  const STORAGE_KEY = "activity_data_dashboard_v1";
  const VERSION = 1;
  const Analysis = window.ActivityMonthAnalysis;
  const UI_KEY = "activity_activity_ui_v9";
  const MODE_DEFS = {
    performance: {
      label: "业绩活动",
      subtitle: "销量单独观察，营业额与实收对照查看",
      metrics: ["sales", "revenue", "received"],
      charts: [["sales"], ["revenue", "received"]],
      chartTitles: ["销量日趋势", "营业额与实收日趋势"],
    },
    conversion: {
      label: "转化率活动",
      subtitle: "追踪领券、核销、消费金额与实际参与人数",
      metrics: ["couponReceived", "couponRedeemed", "couponAmount", "participants"],
      charts: [["couponReceived", "couponRedeemed", "participants"], ["couponAmount"]],
      chartTitles: ["领券、核销与参与人数", "券消费金额日趋势"],
    },
  };

  const METRICS = {
    sales: { label: "销量", short: "销量", color: "#007aff", soft: "rgba(0, 122, 255, .10)", kind: "count" },
    revenue: { label: "营业额", short: "营业额", color: "#34c759", soft: "rgba(52, 199, 89, .10)", kind: "money" },
    received: { label: "实收", short: "实收", color: "#ff9f0a", soft: "rgba(255, 159, 10, .11)", kind: "money" },
    couponReceived: { label: "券领取数量", short: "领券", color: "#007aff", soft: "rgba(0, 122, 255, .10)", kind: "count" },
    couponRedeemed: { label: "券核销数量", short: "核销", color: "#af52de", soft: "rgba(175, 82, 222, .10)", kind: "count" },
    couponAmount: { label: "券消费金额", short: "券消费", color: "#ff9f0a", soft: "rgba(255, 159, 10, .11)", kind: "money" },
    participants: { label: "参与人数", short: "参与", color: "#34c759", soft: "rgba(52, 199, 89, .10)", kind: "count" },
  };

  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  const today = new Date();
  const todayMonth = monthKey(today);
  let state = loadState();
  let ui = { view: "home", activityId: null, month: todayMonth, homeMonth: todayMonth, compareMode: "same", ranking: "decline", navOpen: {} };
  try { const stored = JSON.parse(sessionStorage.getItem(UI_KEY)); if (stored) ui = { ...ui, ...stored }; } catch (_) {}
  ["month", "homeMonth"].forEach((key) => { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ui[key])) ui[key] = todayMonth; });
  if (!["same", "full"].includes(ui.compareMode)) ui.compareMode = "same";
  let editingEventId = null;
  let chartOne = null;
  let chartTwo = null;
  let importTargetActivityId = null;
  let editingTodoId = null;
  let toastTimer = null;

  const $ = (selector) => document.querySelector(selector);
  const els = {
    sidebar: $("#sidebar"), activityNav: $("#activityNav"), activityNavEmpty: $("#activityNavEmpty"),
    homeView: $("#homeView"), activityView: $("#activityView"), breadcrumb: $("#breadcrumb"),
    homeMonthLabel: $("#homeMonthLabel"), homeMonthPicker: $("#homeMonthPicker"), overviewCards: $("#overviewCards"),
    modeTotals: $("#modeTotals"), activityCards: $("#activityCards"), activityCardsEmpty: $("#activityCardsEmpty"),
    activityCountLabel: $("#activityCountLabel"), todoList: $("#todoList"), todoEmpty: $("#todoEmpty"),
    activityTitle: $("#activityTitle"), activityModeBadge: $("#activityModeBadge"), activitySubtitle: $("#activitySubtitle"),
    monthPicker: $("#monthPicker"), daysLabel: $("#daysLabel"), completenessLabel: $("#completenessLabel"),
    metricSummary: $("#metricSummary"), chartOneTitle: $("#chartOneTitle"), chartTwoTitle: $("#chartTwoTitle"),
    chartOneLegend: $("#chartOneLegend"), chartTwoLegend: $("#chartTwoLegend"), chartOneEmpty: $("#chartOneEmpty"),
    chartTwoEmpty: $("#chartTwoEmpty"), dataTableHead: $("#dataTableHead"), dataTableBody: $("#dataTableBody"),
    activityModal: $("#activityModal"), activityForm: $("#activityForm"), activityNameInput: $("#activityNameInput"),
    todoModal: $("#todoModal"), todoForm: $("#todoForm"), todoModalTitle: $("#todoModalTitle"),
    todoModalKicker: $("#todoModalKicker"), todoSubmitButton: $("#todoSubmitButton"),
    fileInput: $("#fileInput"), logoFileInput: $("#logoFileInput"), logoButton: $("#logoButton"),
    brandLogoImage: $("#brandLogoImage"), brandLogoPlaceholder: $("#brandLogoPlaceholder"), toast: $("#toast"),
    exportActivitySelect: $("#exportActivitySelect"), exportMonthSelect: $("#exportMonthSelect"),
    exportFormatSelect: $("#exportFormatSelect"), exportTableButton: $("#exportTableButton"),
    exportPreviewTitle: $("#exportPreviewTitle"), exportPreviewDetail: $("#exportPreviewDetail"),
    saveStatus: $("#saveStatus"),
  };

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function emptyState() {
    return { version: VERSION, activities: [], todos: [], branding: { logo: null }, updatedAt: new Date().toISOString() };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || !Array.isArray(parsed.activities) || !Array.isArray(parsed.todos)) return emptyState();
      parsed.activities.forEach((activity) => {
        activity.data = activity.data && typeof activity.data === "object" ? activity.data : {};
        activity.mode = MODE_DEFS[activity.mode] ? activity.mode : "performance";
        activity.events = Array.isArray(activity.events) ? activity.events : [];
      });
      parsed.branding = parsed.branding && typeof parsed.branding === "object" ? parsed.branding : { logo: null };
      return { ...emptyState(), ...parsed, version: VERSION };
    } catch (error) {
      console.warn("本地数据读取失败，已建立空白数据。", error);
      return emptyState();
    }
  }

  function showSaveStatus(detail) {
    els.saveStatus.textContent = detail.message;
    els.saveStatus.dataset.state = detail.state;
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      showSaveStatus(window.__getSharedStorageStatus ? window.__getSharedStorageStatus() : {state:"saved",message:"已保存到本机"});
    } catch (error) {
      showSaveStatus({state:"error",message:"保存失败"});
      showToast("保存失败：" + error.message + "。请先导出备份。", 4500);
    }
  }

  function rememberUI() {
    const active = document.activeElement;
    ui.scrollY = window.scrollY;
    ui.tableScroll = $(".table-scroll")?.scrollTop || 0;
    ui.focusDate = ui.view === "activity" ? active?.closest("tr[data-date]")?.dataset.date || null : null;
    ui.focusField = active?.dataset.field || null;
    try { sessionStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (_) {}
  }

  function restorePosition(saved) {
    window.scrollTo(0, saved.scrollY || 0);
    const table = $(".table-scroll");
    if (table) table.scrollTop = saved.tableScroll || 0;
    if (saved.focusDate && saved.focusField) {
      const input = [...els.dataTableBody.querySelectorAll("input[data-field]")].find((el) => el.dataset.field === saved.focusField && el.closest("tr").dataset.date === saved.focusDate);
      input?.focus({preventScroll:true});
    }
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(key) {
    const [year, month] = key.split("-");
    return `${year}年${Number(month)}月`;
  }

  function shiftMonth(key, delta) {
    const [year, month] = key.split("-").map(Number);
    return monthKey(new Date(year, month - 1 + delta, 1));
  }

  function daysInMonth(key) {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month, 0).getDate();
  }

  function dateKey(key, day) {
    return `${key}-${String(day).padStart(2, "0")}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function parseNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const cleaned = String(value).replace(/[,，￥¥%]/g, "").trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  function hasValue(value) { return Analysis.hasValue(value); }

  function formatNumber(value, kind = "count", compact = false) {
    const num = Number(value) || 0;
    if (compact && Math.abs(num) >= 10000) return `${(num / 10000).toFixed(num % 10000 === 0 ? 0 : 1)}万`;
    const maximumFractionDigits = kind === "money" ? 2 : (Number.isInteger(num) ? 0 : 2);
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits }).format(num);
  }

  function formatMetric(value, metricKey, compact = false) {
    const metric = METRICS[metricKey];
    return `${metric.kind === "money" ? "¥" : ""}${formatNumber(value, metric.kind, compact)}`;
  }

  function dataDatesForMonth(activity, key) {
    const prefix = `${key}-`;
    return Object.keys(activity.data).filter((date) => Analysis.validDate(date) && date.startsWith(prefix));
  }

  function rowHasMetricData(row, mode) {
    return MODE_DEFS[mode].metrics.some((metric) => hasValue(row?.[metric]));
  }

  function activityMonths(activity) {
    const months = new Set();
    Object.entries(activity.data || {}).forEach(([date, row]) => {
      const match = String(date).match(/^(\d{4}-\d{2})-\d{2}$/);
      if (match && Analysis.validDate(date) && rowHasMetricData(row, activity.mode)) months.add(match[1]);
    });
    return [...months].sort((a, b) => b.localeCompare(a));
  }

  function activitiesForMonth(key) {
    return state.activities.filter((activity) => summarizeActivity(activity, key).dataDays > 0);
  }

  function summarizeActivity(activity, key) {
    const summary = {};
    MODE_DEFS[activity.mode].metrics.forEach((metric) => { summary[metric] = 0; });
    let dataDays = 0;
    dataDatesForMonth(activity, key).forEach((date) => {
      const row = activity.data[date] || {};
      if (rowHasMetricData(row, activity.mode)) dataDays += 1;
      MODE_DEFS[activity.mode].metrics.forEach((metric) => {
        if (hasValue(row[metric])) summary[metric] += Number(row[metric]);
      });
    });
    return { totals: summary, dataDays, completeness: Math.round((dataDays / daysInMonth(key)) * 100) };
  }

  function getActivity() {
    return state.activities.find((activity) => activity.id === ui.activityId) || null;
  }

  function showToast(message, duration = 2600) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, duration);
  }

  function showModal(element) {
    element.hidden = false;
    const input = element.querySelector("input:not([type=radio])");
    setTimeout(() => input?.focus(), 10);
  }

  function hideModal(element) {
    element.hidden = true;
  }

  function renderLogo() {
    const logo = state.branding?.logo;
    els.brandLogoImage.hidden = !logo;
    els.brandLogoPlaceholder.hidden = Boolean(logo);
    els.brandLogoImage.src = logo || "";
    els.logoButton.setAttribute("aria-label", logo ? "删除品牌 LOGO" : "上传品牌 LOGO");
    els.logoButton.title = logo ? "点击删除当前 LOGO" : "点击上传 LOGO";
  }

  function resizeLogo(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("图片格式不受支持"));
        image.onload = () => {
          const maxSide = 512;
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function openTodoModal(todo = null) {
    editingTodoId = todo?.id || null;
    els.todoModalKicker.textContent = todo ? "EDIT TO-DO" : "NEW TO-DO";
    els.todoModalTitle.textContent = todo ? "编辑待办任务" : "添加待办任务";
    els.todoSubmitButton.textContent = todo ? "保存修改" : "添加待办";
    $("#todoDate").value = todo?.date || new Date().toISOString().slice(0, 10);
    $("#todoSubject").value = todo?.subject || "";
    $("#todoOwner").value = todo?.owner || "";
    $("#todoContent").value = todo?.content || "";
    showModal(els.todoModal);
  }

  function renderNavigation() {
    els.activityNav.querySelectorAll("details[data-nav-month]").forEach((el) => { ui.navOpen[el.dataset.navMonth] = el.open; });
    const monthGroups = new Map();
    const pendingActivities = [];
    state.activities.forEach((activity) => {
      const months = activityMonths(activity);
      if (!months.length) { pendingActivities.push(activity); return; }
      months.forEach((month) => {
        if (!monthGroups.has(month)) monthGroups.set(month, []);
        monthGroups.get(month).push(activity);
      });
    });
    const focusedMonth = ui.view === "activity" ? ui.month : ui.homeMonth;
    const activityButton = (activity, month) => `
      <button class="activity-nav-item ${ui.view === "activity" && ui.activityId === activity.id && ui.month === month ? "active" : ""}" type="button" data-activity-id="${activity.id}" data-month="${month}" data-mode="${activity.mode}">
        <span class="mode-dot"></span><span>${escapeHtml(activity.name)}</span>
      </button>`;
    const monthSections = [...monthGroups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, activities]) => `
      <details class="activity-month-group" data-nav-month="${month}" ${(Object.prototype.hasOwnProperty.call(ui.navOpen, month) ? ui.navOpen[month] : month === focusedMonth) ? "open" : ""}>
        <summary><span>${monthLabel(month)}</span><small>${activities.length}</small></summary>
        <div class="activity-month-items">${activities.map((activity) => activityButton(activity, month)).join("")}</div>
      </details>`).join("");
    const pendingSection = pendingActivities.length ? `
      <details class="activity-month-group pending-group" ${!monthGroups.size || (ui.view === "activity" && pendingActivities.some((activity) => activity.id === ui.activityId)) ? "open" : ""}>
        <summary><span>待录入</span><small>${pendingActivities.length}</small></summary>
        <div class="activity-month-items">${pendingActivities.map((activity) => activityButton(activity, ui.view === "activity" && ui.activityId === activity.id ? ui.month : ui.homeMonth)).join("")}</div>
      </details>` : "";
    els.activityNav.innerHTML = monthSections + pendingSection;
    els.activityNavEmpty.hidden = state.activities.length > 0;
    document.querySelector('[data-view="home"]').classList.toggle("active", ui.view === "home");
  }

  function renderHome() {
    renderLogo();
    els.homeMonthPicker.value = ui.homeMonth;
    els.homeMonthLabel.textContent = monthLabel(ui.homeMonth);
    const monthActivities = activitiesForMonth(ui.homeMonth);
    const recordedRows = monthActivities.reduce((sum, activity) => sum + summarizeActivity(activity, ui.homeMonth).dataDays, 0);
    const openTodos = state.todos.filter((todo) => !todo.completed).length;
    els.overviewCards.innerHTML = [
      ["活动总数", monthActivities.length, "本月有数据活动"],
      ["本月录入数", recordedRows, "按活动日记录计"],
      ["待办未完成", openTodos, "项任务待推进"],
    ].map(([label, value, detail]) => `<article class="overview-card"><span>${label}</span><strong>${formatNumber(value)}</strong><small>${detail}</small></article>`).join("");

    const aggregate = {
      performance: { sales: 0, revenue: 0, received: 0 },
      conversion: { couponReceived: 0, couponRedeemed: 0, couponAmount: 0, participants: 0 },
    };
    monthActivities.forEach((activity) => {
      const summary = summarizeActivity(activity, ui.homeMonth).totals;
      Object.keys(aggregate[activity.mode]).forEach((metric) => { aggregate[activity.mode][metric] += summary[metric] || 0; });
    });
    els.modeTotals.innerHTML = `
      <article class="mode-total-card"><div><strong>业绩活动 · ${monthLabel(ui.homeMonth)}合计</strong><small>${monthActivities.filter((a) => a.mode === "performance").length} 个活动</small></div><div class="metric-inline">销量 ${formatNumber(aggregate.performance.sales)}<br>营业额 ${formatMetric(aggregate.performance.revenue, "revenue")} · 实收 ${formatMetric(aggregate.performance.received, "received")}</div></article>
      <article class="mode-total-card"><div><strong>转化率活动 · ${monthLabel(ui.homeMonth)}合计</strong><small>${monthActivities.filter((a) => a.mode === "conversion").length} 个活动</small></div><div class="metric-inline">领券 ${formatNumber(aggregate.conversion.couponReceived)} · 核销 ${formatNumber(aggregate.conversion.couponRedeemed)}<br>消费 ${formatMetric(aggregate.conversion.couponAmount, "couponAmount")} · 参与 ${formatNumber(aggregate.conversion.participants)}</div></article>`;

    els.activityCountLabel.textContent = `${monthActivities.length} 个本月活动`;
    els.activityCards.innerHTML = monthActivities.map(activityCardHtml).join("");
    els.activityCardsEmpty.hidden = monthActivities.length > 0;
    els.todoList.innerHTML = state.todos.slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)).map((todo) => `
      <article class="todo-item ${todo.completed ? "completed" : ""}" data-todo-id="${todo.id}">
        <input class="todo-check" type="checkbox" aria-label="完成 ${escapeHtml(todo.subject)}" ${todo.completed ? "checked" : ""} />
        <div class="todo-main"><strong>${escapeHtml(todo.subject)}</strong><p>${escapeHtml(todo.content)}</p><div class="todo-meta"><span>${escapeHtml(todo.date)}</span><span>负责人：${escapeHtml(todo.owner)}</span></div></div>
        <div class="todo-actions"><button class="todo-edit" type="button" aria-label="编辑待办" title="编辑">✎</button><button class="todo-delete" type="button" aria-label="删除待办" title="删除">×</button></div>
      </article>`).join("");
    els.todoEmpty.hidden = state.todos.length > 0;
    renderExportModule();
    renderHomeAnalysis();
  }

  function renderExportModule() {
    const previousActivity = els.exportActivitySelect.value || "all";
    const previousMonth = els.exportMonthSelect.value || ui.homeMonth;
    els.exportActivitySelect.innerHTML = `<option value="all">全部活动</option>${state.activities.map((activity) => `<option value="${activity.id}">${escapeHtml(activity.name)}</option>`).join("")}`;
    els.exportActivitySelect.value = previousActivity === "all" || state.activities.some((activity) => activity.id === previousActivity) ? previousActivity : "all";
    els.exportMonthSelect.innerHTML = `<option value="${ui.homeMonth}">${monthLabel(ui.homeMonth)}</option><option value="all">全部月份</option>`;
    els.exportMonthSelect.value = previousMonth === "all" ? "all" : ui.homeMonth;
    updateExportPreview();
  }

  function updateExportPreview() {
    const activityId = els.exportActivitySelect.value || "all";
    const month = els.exportMonthSelect.value || ui.homeMonth;
    const rows = buildExportRows(activityId, month);
    const activityCount = new Set(rows.map((row) => row["活动名称"])).size;
    els.exportPreviewTitle.textContent = rows.length ? `预计导出 ${rows.length} 条` : "暂无可导出数据";
    els.exportPreviewDetail.textContent = rows.length
      ? `${activityCount} 个活动 · ${month === "all" ? "全部月份" : monthLabel(month)} · 含备注列`
      : "调整活动或月份范围后再试";
    els.exportTableButton.disabled = rows.length === 0;
  }

  function activityCardHtml(activity) {
    const key = ui.homeMonth;
    const summary = summarizeActivity(activity, key);
    const pairs = activity.mode === "performance"
      ? [["销量", formatNumber(summary.totals.sales, "count", true)], ["实收", formatMetric(summary.totals.received, "received", true)]]
      : [["领券", formatNumber(summary.totals.couponReceived, "count", true)], ["券消费", formatMetric(summary.totals.couponAmount, "couponAmount", true)]];
    return `<article class="activity-card" data-activity-card="${activity.id}" data-month="${key}" data-mode="${activity.mode}" tabindex="0" role="button">
      <div class="card-top"><h3>${escapeHtml(activity.name)}</h3><span class="mini-badge">${MODE_DEFS[activity.mode].label.replace("活动", "")}</span></div>
      <div class="card-summary">${pairs.map(([label, value]) => `<span>${label}<strong>${value}</strong></span>`).join("")}</div>
      <div class="completeness-track"><i style="width:${Math.min(100, summary.completeness)}%"></i></div>
      <div class="card-footer"><span>${monthLabel(key)} · 完整度 ${summary.completeness}%</span><span>更新 ${formatRelativeTime(activity.updatedAt)}</span></div>
    </article>`;
  }

  function formatRelativeTime(iso) {
    if (!iso) return "暂无";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  }

  function renderActivity() {
    const activity = getActivity();
    if (!activity) { openHome(); return; }
    const def = MODE_DEFS[activity.mode];
    els.activityTitle.textContent = activity.name;
    els.activityModeBadge.textContent = def.label;
    els.activityModeBadge.className = `mode-badge ${activity.mode}`;
    els.activitySubtitle.textContent = def.subtitle;
    els.monthPicker.value = ui.month;
    els.breadcrumb.textContent = `活动 / ${activity.name}`;
    const summary = summarizeActivity(activity, ui.month);
    $("#activityCompareMode").value = ui.compareMode;
    els.daysLabel.textContent = `${daysInMonth(ui.month)} 天`;
    els.completenessLabel.textContent = `已录入 ${summary.dataDays} 天 · 完整度 ${summary.completeness}%`;
    renderMetricSummary(activity, summary);
    renderTable(activity);
    renderCharts();
    renderActivityAnalysis(activity);
    renderEvents(activity);
  }

  function currentRange(month) { return Analysis.range(state.activities, month, ui.compareMode); }

  function deltaHtml(item) {
    return item.delta === null ? `<span class="delta neutral">${item.status}</span>`
      : `<span class="delta ${item.delta < 0 ? "down" : "up"}">${item.delta > 0 ? "+" : ""}${item.delta.toFixed(1)}%</span>`;
  }

  function averageText(value, key) { return value === null ? "—" : formatMetric(value, key); }

  function rangeText(r) {
    if (!r.end) return "本月暂无指标数据；录入后按页面所示有效日期口径比较。";
    return `本月 ${r.month}-01 至 ${dateKey(r.month,r.end)} · 对比 ${r.previous}-01 至 ${dateKey(r.previous,r.prevEnd)}（${r.mode === "same" ? "上月同期" : "上月整月"}）`;
  }

  function renderMetricSummary(activity) {
    const report = Analysis.compare(activity, currentRange(ui.month));
    els.metricSummary.innerHTML = MODE_DEFS[activity.mode].metrics.map((key) => {
      const metric = METRICS[key], item = report.metrics[key];
      return `<article class="metric-card" style="--metric-soft:${metric.soft}"><span class="metric-name">${metric.label} · 本月累计</span><strong class="metric-total">${item.current.recordedDays ? formatMetric(item.current.rawTotal,key) : "—"}</strong>
        <div class="daily-comparison"><div><small>本月日均</small><b>${averageText(item.current.average,key)}</b></div><div><small>上月日均</small><b>${averageText(item.previous.average,key)}</b></div></div>
        <div class="metric-change"><span>日均环比</span>${deltaHtml(item)}</div><div class="metric-detail">有效天数：本月 ${item.current.days} / ${report.range.end} · 上月 ${item.previous.days} / ${report.range.prevEnd}</div>
        ${activity.mode === 'performance' ? `<small class="coverage-note">已剔除零销量：本月 ${item.current.excludedZeroDays} 天 · 上月 ${item.previous.excludedZeroDays} 天</small>` : ''}
        ${item.partial ? '<small class="coverage-note">含缺录或待核对日期，环比仅供参考</small>' : ''}</article>`;
    }).join("");
  }

  function renderHomeAnalysis() {
    $("#homeCompareMode").value = ui.compareMode;
    $("#activityRanking").value = ui.ranking;
    const r = currentRange(ui.homeMonth);
    $("#homeComparisonRange").textContent = rangeText(r);
    const reports = activitiesForMonth(ui.homeMonth).map((a) => Analysis.compare(a,r));
    reports.sort((a,b) => {
      if (ui.ranking === "name") return a.activity.name.localeCompare(b.activity.name,"zh-CN");
      if (a.primary.delta === null) return b.primary.delta === null ? 0 : 1;
      if (b.primary.delta === null) return -1;
      return ui.ranking === "growth" ? b.primary.delta-a.primary.delta : a.primary.delta-b.primary.delta;
    });
    $("#comparisonRows").innerHTML = reports.map((report) => {
      const {activity:a,primary:m,key} = report;
      return `<tr><td><button type="button" class="comparison-link" data-analysis-activity="${escapeHtml(a.id)}">${escapeHtml(a.name)}</button><small>${METRICS[key].label} · ${MODE_DEFS[a.mode].label}</small></td>
        <td>${m.current.recordedDays ? formatMetric(m.current.rawTotal,key) : "—"}</td><td>${averageText(m.current.average,key)}</td><td>${averageText(m.previous.average,key)}</td><td>${deltaHtml(m)}</td>
        <td>${m.current.days}/${r.end} · ${m.previous.days}/${r.prevEnd}<small>${m.partial ? "含缺录或待核对日期" : "有效日期录入完整"}</small>${a.mode === 'performance' ? `<small>剔除零销量 ${m.current.excludedZeroDays} / ${m.previous.excludedZeroDays} 天</small>` : ''}</td></tr>`;
    }).join("");
    $("#comparisonEmpty").hidden = reports.length > 0;
    const comparable = reports.filter((r) => r.primary.delta !== null);
    const down = comparable.filter((r) => r.primary.delta < 0);
    $("#homeAnalysisSummary").textContent = `本月 ${reports.length} 个活动，其中 ${comparable.length} 个主指标可比，${down.length} 个日均下降。点击活动名称查看变化环节。`;
  }

  function renderActivityAnalysis(activity) {
    const report = Analysis.compare(activity,currentRange(ui.month));
    $("#activityComparisonRange").textContent = rangeText(report.range);
    $("#activityComparisonRule").textContent = activity.mode === 'performance'
      ? '比较截止日按最新指标录入日期确定。日均及双月趋势仅纳入销量 > 0 且该指标已录入的日期；零销量、销量空白均不计入比较。日均 = 有效日期指标合计 ÷ 有效天数。本月累计保留全部原始记录。'
      : '比较截止日按最新指标录入日期确定。日均按各指标已录入天数计算，0 计入、空白不计入；转化率活动没有销量字段。';
    $("#activityInsights").innerHTML = Analysis.insights(report).map((item) => `<article><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.text)}</p></article>`).join("");
  }

  function renderEvents(activity) {
    const prev = Analysis.previous(ui.month);
    const events = (activity.events || []).filter((e) => e.date?.startsWith(ui.month+"-") || e.date?.startsWith(prev+"-")).sort((a,b) => b.date.localeCompare(a.date));
    $("#eventList").innerHTML = events.map((e) => `<article class="event-item"><span class="event-date">${escapeHtml(e.date)}</span><div><strong>${escapeHtml(e.kind)}${e.date.startsWith(prev) ? ' · 上月' : ''}</strong><p>${escapeHtml(e.note)}</p></div><button type="button" class="small-button" data-event-edit="${escapeHtml(e.id)}">编辑</button><button type="button" class="small-button" data-event-delete="${escapeHtml(e.id)}">删除</button></article>`).join("");
    $("#eventEmpty").hidden = events.length > 0;
    if (!$("#eventDate").value) $("#eventDate").value = dateKey(ui.month,Analysis.cutoff([activity],ui.month)||1);
  }

  function renderTable(activity) {
    const metrics = MODE_DEFS[activity.mode].metrics;
    els.dataTableHead.innerHTML = `<tr><th>日期</th><th>星期</th>${metrics.map((key) => `<th>${METRICS[key].label}${METRICS[key].kind === "money" ? "（元）" : ""}</th>`).join("")}<th>备注</th></tr>`;
    const [year, month] = ui.month.split("-").map(Number);
    const todayKey = dateKey(todayMonth, today.getDate());
    els.dataTableBody.innerHTML = Array.from({ length: daysInMonth(ui.month) }, (_, index) => {
      const day = index + 1;
      const key = dateKey(ui.month, day);
      const row = activity.data[key] || {};
      const weekday = new Date(year, month - 1, day).getDay();
      return `<tr class="${weekday === 0 || weekday === 6 ? "weekend" : ""} ${key === todayKey ? "today" : ""}" data-date="${key}">
        <td class="day-cell">${month}/${String(day).padStart(2, "0")}</td><td class="weekday-cell">周${WEEKDAYS[weekday]}</td>
        ${metrics.map((metric) => `<td><input type="number" inputmode="decimal" step="${METRICS[metric].kind === "money" ? "0.01" : "1"}" min="0" data-field="${metric}" value="${hasValue(row[metric]) ? escapeHtml(row[metric]) : ""}" aria-label="${day}日 ${METRICS[metric].label}" /></td>`).join("")}
        <td><input type="text" maxlength="120" data-field="note" value="${escapeHtml(row.note || "")}" placeholder="当天活动、天气或异常情况" aria-label="${day}日备注" /></td>
      </tr>`;
    }).join("");
  }

  function legendHtml(metricKeys) {
    return metricKeys.map((key) => `<span class="legend-item"><i class="legend-dot" style="background:${METRICS[key].color}"></i>${METRICS[key].short}</span>`).join("");
  }

  function chartConfig(activity, metricKeys) {
    const r = currentRange(ui.month);
    const totalDays = Math.max(daysInMonth(ui.month),r.prevEnd);
    const events = activity.events || [];
    const datasets = metricKeys.flatMap((key) => [false,true].map((isPrevious) => {
      const month = isPrevious ? r.previous : r.month, end = isPrevious ? r.prevEnd : r.end;
      return {
        label:`${monthLabel(month)} · ${METRICS[key].label}`, metricKey:key, sourceMonth:month,
        data:Array.from({length:totalDays},(_,i) => {
          if(i+1>end) return null;
          const row=activity.data[dateKey(month,i+1)];
          const value=row?.[key];
          return Analysis.eligible(activity,row) && hasValue(value) ? Number(value) : null;
        }),
        borderColor:METRICS[key].color,backgroundColor:METRICS[key].color,
        borderWidth:isPrevious?1.6:2.2,borderDash:isPrevious?[5,5]:[],pointRadius:isPrevious?1:2.3,
        pointStyle:isPrevious?'rectRot':'circle',pointHoverRadius:5,tension:0.2,spanGaps:false
      };
    }));
    const eventMarkers = {
      id:'activityEventMarkers',afterDatasetsDraw(chart) {
        const {ctx,chartArea,scales}=chart;
        events.forEach((event) => {
          if (!Analysis.validDate(event.date)) return;
          const month=event.date?.slice(0,7),day=Number(event.date?.slice(8));
          const end=month===r.month?r.end:month===r.previous?r.prevEnd:0;
          if(day<1||day>end) return;
          const x=scales.x.getPixelForValue(day-1);
          ctx.save();ctx.strokeStyle=month===r.month?'#b16d00':'#9b8abc';ctx.setLineDash([3,4]);ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(x,chartArea.top);ctx.lineTo(x,chartArea.bottom);ctx.stroke();ctx.setLineDash([]);
          ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(x,chartArea.top+5,3,0,Math.PI*2);ctx.fill();ctx.restore();
        });
      }
    };
    return {type:'line',data:{labels:Array.from({length:totalDays},(_,i)=>`${i+1}日`),datasets},plugins:[eventMarkers],options:{
      responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(29,29,31,.92)',padding:12,
        callbacks:{title:(items)=>`${items[0].dataIndex+1}日 · 双月对比`,label:(context)=>` ${context.dataset.label}：${context.raw===null?'—':formatMetric(context.raw,context.dataset.metricKey)}`,
          afterBody:(items)=>events.filter((e)=>Number(e.date?.slice(8))===items[0].dataIndex+1 && (e.date?.startsWith(r.month)||e.date?.startsWith(r.previous))).map((e)=>`${e.date} ${e.kind}：${e.note}`)}}},
      scales:{x:{grid:{display:false},ticks:{color:'#86868b',font:{size:10},maxRotation:0,autoSkip:true,maxTicksLimit:16}},
        y:{beginAtZero:true,grid:{color:'rgba(0,0,0,.06)'},border:{display:false},ticks:{color:'#86868b',font:{size:10},callback:(value)=>formatNumber(value,'count',true)}}}
    }};
  }

  /* 注意：录入防抖会调用此函数，因此保持为可提升的函数声明。 */
  function renderCharts() {
    const activity = getActivity();
    if (!activity || typeof window.Chart === "undefined") return;
    const def = MODE_DEFS[activity.mode];
    chartOne?.destroy();
    chartTwo?.destroy();
    els.chartOneTitle.textContent = def.chartTitles[0];
    els.chartTwoTitle.textContent = def.chartTitles[1];
    els.chartOneLegend.innerHTML = legendHtml(def.charts[0]);
    els.chartTwoLegend.innerHTML = legendHtml(def.charts[1]);
    const range = currentRange(ui.month);
    const groupHasData = (group) => group.some((key) => Analysis.stats(activity,ui.month,range.end,key).days || Analysis.stats(activity,range.previous,range.prevEnd,key).days);
    els.chartOneEmpty.textContent = els.chartTwoEmpty.textContent = activity.mode === 'performance'
      ? '暂无可比数据：请录入销量 > 0 的日期及对应指标' : '录入数据后，这里会显示整月趋势';
    els.chartOneEmpty.hidden = groupHasData(def.charts[0]);
    els.chartTwoEmpty.hidden = groupHasData(def.charts[1]);
    chartOne = new Chart($("#chartOne"), chartConfig(activity, def.charts[0]));
    chartTwo = new Chart($("#chartTwo"), chartConfig(activity, def.charts[1]));
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  const debouncedRenderCharts = debounce(renderCharts, 220);

  function handleTableInput(event) {
    const input = event.target.closest("input[data-field]");
    if (!input) return;
    const activity = getActivity();
    const rowElement = input.closest("tr[data-date]");
    if (!activity || !rowElement) return;
    const date = rowElement.dataset.date;
    const field = input.dataset.field;
    const oldMonths = activityMonths(activity).join();
    const row = activity.data[date] || {};
    if (field === "note") row.note = input.value.trimStart();
    else row[field] = input.value === "" ? null : parseNumber(input.value);
    const hasAnyMetric = MODE_DEFS[activity.mode].metrics.some((metric) => hasValue(row[metric]));
    if (!hasAnyMetric && !row.note) delete activity.data[date];
    else activity.data[date] = row;
    activity.updatedAt = new Date().toISOString();
    saveState("保存中…");
    const summary = summarizeActivity(activity, ui.month);
    els.completenessLabel.textContent = `已录入 ${summary.dataDays} 天 · 完整度 ${summary.completeness}%`;
    renderMetricSummary(activity, summary);
    renderActivityAnalysis(activity);
    if (activityMonths(activity).join() !== oldMonths) renderNavigation();
    rememberUI();
    debouncedRenderCharts();
  }

  function openHome() {
    ui.view = "home";
    rememberUI();
    els.homeView.hidden = false;
    els.activityView.hidden = true;
    els.breadcrumb.textContent = "首页 / 数据总览";
    chartOne?.destroy(); chartOne = null;
    chartTwo?.destroy(); chartTwo = null;
    renderNavigation();
    renderHome();
    els.sidebar.classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openActivity(id, month = null) {
    const activity = state.activities.find((item) => item.id === id);
    if (!activity) return;
    const inheritedMonth = month || (ui.view === "activity" ? ui.month : ui.homeMonth) || todayMonth;
    ui.view = "activity";
    ui.activityId = id;
    ui.month = inheritedMonth;
    ui.navOpen[inheritedMonth] = true;
    $("#eventForm").reset(); editingEventId = null; $("#eventSubmit").textContent = "添加标记";
    $("#eventDate").value = "";
    rememberUI();
    els.homeView.hidden = true;
    els.activityView.hidden = false;
    renderNavigation();
    renderActivity();
    els.sidebar.classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function createActivity(name, mode) {
    const activity = { id: uid("act"), name: name.trim(), mode, data: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.activities.unshift(activity);
    saveState();
    hideModal(els.activityModal);
    els.activityForm.reset();
    openActivity(activity.id, ui.homeMonth);
    showToast("活动已创建，可以开始录入数据。", 2400);
  }

  function exportJson() {
    const payload = { ...state, exportedAt: new Date().toISOString(), app: "会员运营活动效果数据看板" };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }), `会员运营活动效果数据看板备份_${todayMonth}.json`);
    showToast("JSON 整体备份已导出。", 2200);
  }

  function buildExportRows(activityId = "all", month = "all") {
    const rows = [];
    state.activities.filter((activity) => activityId === "all" || activity.id === activityId).forEach((activity) => {
      Object.keys(activity.data).sort().forEach((date) => {
        if (month !== "all" && date.slice(0, 7) !== month) return;
        const row = activity.data[date];
        rows.push({
          "活动名称": activity.name,
          "活动模式": MODE_DEFS[activity.mode].label,
          "月份": date.slice(0, 7),
          "日期": date,
          "日": Number(date.slice(8, 10)),
          "销量": hasValue(row.sales) ? row.sales : "",
          "营业额（元）": hasValue(row.revenue) ? row.revenue : "",
          "实收（元）": hasValue(row.received) ? row.received : "",
          "券领取数量": hasValue(row.couponReceived) ? row.couponReceived : "",
          "券核销数量": hasValue(row.couponRedeemed) ? row.couponRedeemed : "",
          "券消费金额（元）": hasValue(row.couponAmount) ? row.couponAmount : "",
          "参与人数": hasValue(row.participants) ? row.participants : "",
          "备注": row.note || "",
        });
      });
    });
    return rows;
  }

  function exportScopedTable(activityId = "all", month = "all", format = "xlsx") {
    if (typeof window.XLSX === "undefined") { showToast("表格组件未加载，请确认 vendor 文件完整。", 4000); return; }
    const rows = buildExportRows(activityId, month);
    if (!rows.length) { showToast("暂无可导出的每日数据。", 2500); return; }
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [18, 12, 10, 13, 6, 10, 13, 13, 13, 13, 16, 11, 36].map((wch) => ({ wch }));
    const activityName = activityId === "all" ? "全部活动" : state.activities.find((activity) => activity.id === activityId)?.name || "活动";
    const monthName = month === "all" ? "全部月份" : month.replace("-", "");
    const safeName = activityName.replace(/[\\/:*?"<>|]/g, "_");
    if (format === "csv") {
      const csv = `\ufeff${XLSX.utils.sheet_to_csv(sheet)}`;
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${safeName}_${monthName}_数据长表.csv`);
    } else {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "活动数据长表");
      XLSX.writeFile(workbook, `${safeName}_${monthName}_数据长表.xlsx`);
    }
    showToast(`已导出 ${rows.length} 条长表数据（含备注）。`, 2600);
  }

  function exportExcel() {
    exportScopedTable(ui.activityId || "all", ui.month || "all", "xlsx");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function normalizeHeader(value) {
    return String(value ?? "").trim().toLowerCase().replace(/[\s（）()\[\]【】_\-—:：]/g, "");
  }

  const HEADER_ALIASES = {
    activity: ["活动名称", "活动名", "活动", "activityname", "activity"],
    mode: ["活动模式", "模式", "activitymode", "mode"],
    month: ["月份", "月度", "month", "monthdate"],
    date: ["日期", "完整日期", "date", "daydate"],
    day: ["日", "天", "日序", "day"],
    note: ["备注", "说明", "当日备注", "note", "remark", "comments"],
    sales: ["销量", "销售量", "销售数量", "sales", "quantity"],
    revenue: ["营业额", "营业额元", "销售额", "营收", "revenue", "turnover"],
    received: ["实收", "实收元", "实收金额", "预计收入", "received", "actualincome"],
    couponReceived: ["券领取数量", "领券数量", "领取数量", "券领取", "couponreceived", "claimed"],
    couponRedeemed: ["券核销数量", "核销数量", "用券数量", "券核销", "couponredeemed", "redeemed"],
    couponAmount: ["券消费金额", "券消费金额元", "核销金额", "券带动消费金额", "couponamount", "couponspend"],
    participants: ["参与人数", "消费人数", "活动人数", "participants", "people"],
  };

  function mapHeaders(headerRow) {
    const aliasMap = {};
    Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => aliases.forEach((alias) => { aliasMap[normalizeHeader(alias)] = field; }));
    return headerRow.map((header) => aliasMap[normalizeHeader(header)] || null);
  }

  function excelSerialParts(serial) {
    if (!Number.isFinite(Number(serial))) return null;
    const millis = Math.round((Number(serial) - 25569) * 86400000);
    const date = new Date(millis);
    if (Number.isNaN(date.getTime())) return null;
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  function partsFromDateObject(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }

  function parseMonthValue(value) {
    if (value instanceof Date) {
      const parts = partsFromDateObject(value);
      return parts ? `${parts.year}-${String(parts.month).padStart(2, "0")}` : null;
    }
    const rawText = String(value ?? "").trim();
    const compactMonth = rawText.match(/^(\d{4})(\d{2})$/);
    if (compactMonth) {
      const year = Number(compactMonth[1]); const month = Number(compactMonth[2]);
      if (month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, "0")}`;
    }
    if (typeof value === "number" || (/^\d+(\.\d+)?$/.test(rawText) && Number(value) > 1000)) {
      const parts = excelSerialParts(Number(value));
      return parts ? `${parts.year}-${String(parts.month).padStart(2, "0")}` : null;
    }
    const text = rawText;
    let match = text.match(/^(\d{4})[年\-\/.](\d{1,2})/);
    if (!match) match = text.match(/^(\d{4})(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]); const month = Number(match[2]);
    return month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, "0")}` : null;
  }

  function parseDateValue(value, monthHint, dayHint) {
    if (value instanceof Date) {
      const p = partsFromDateObject(value);
      return p ? `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}` : null;
    }
    if (typeof value === "number" && value > 59) {
      const p = excelSerialParts(value);
      return p ? `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}` : null;
    }
    const text = String(value ?? "").trim();
    if (text) {
      let match = null;
      if (/^\d{8}$/.test(text)) match = [text, text.slice(0, 4), text.slice(4, 6), text.slice(6, 8)];
      if (!match && /^\d+(\.\d+)?$/.test(text) && Number(text) > 1000) {
        const p = excelSerialParts(Number(text));
        if (p) return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
      }
      const normalized = text.replace(/[年月/.]/g, "-").replace(/日/g, "").replace(/-+/g, "-");
      if (!match) match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (match) {
        const y = Number(match[1]); const m = Number(match[2]); const d = Number(match[3]);
        if (isValidDate(y, m, d)) return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
      const short = normalized.match(/^(\d{1,2})-(\d{1,2})$/);
      if (short && monthHint) {
        const y = Number(monthHint.slice(0, 4)); const m = Number(short[1]); const d = Number(short[2]);
        if (isValidDate(y, m, d)) return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
    const day = parseNumber(dayHint ?? value);
    if (monthHint && day !== null && day >= 1 && day <= daysInMonth(monthHint)) return dateKey(monthHint, day);
    return null;
  }

  function isValidDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  async function handleImport(file) {
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();
    try {
      if (extension === "json") await importJson(file);
      else if (["csv", "xlsx", "xls"].includes(extension)) await importWorkbook(file);
      else showToast("仅支持 .json、.csv、.xlsx、.xls 文件。", 3500);
    } catch (error) {
      console.error(error);
      showToast(`导入失败：${error.message || "请检查文件格式"}`, 4500);
    } finally {
      els.fileInput.value = "";
      importTargetActivityId = null;
    }
  }

  async function importJson(file) {
    const imported = JSON.parse(await file.text());
    if (!imported || !Array.isArray(imported.activities) || !Array.isArray(imported.todos)) throw new Error("不是有效的会员运营活动效果数据看板备份");
    if (!confirm(`JSON 备份将替换当前全部数据（${state.activities.length} 个活动）。是否继续？`)) return;
    state = { ...emptyState(), ...imported, version: VERSION };
    state.activities.forEach((activity) => {
      activity.id ||= uid("act"); activity.mode = MODE_DEFS[activity.mode] ? activity.mode : "performance"; activity.data ||= {}; activity.events = Array.isArray(activity.events) ? activity.events : [];
    });
    state.todos.forEach((todo) => { todo.id ||= uid("todo"); });
    saveState();
    openHome();
    showToast(`备份恢复完成：${state.activities.length} 个活动。`, 3000);
  }

  async function importWorkbook(file) {
    if (typeof window.XLSX === "undefined") throw new Error("Excel 解析组件未加载");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: true });
    let importedRows = 0;
    let skippedRows = 0;
    let createdActivities = 0;
    workbook.SheetNames.forEach((sheetName) => {
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "", blankrows: false });
      if (matrix.length < 2) return;
      const fieldMap = mapHeaders(matrix[0]);
      matrix.slice(1).forEach((cells) => {
        const record = {};
        fieldMap.forEach((field, index) => { if (field) record[field] = cells[index]; });
        const result = mergeImportedRecord(record);
        if (result.imported) importedRows += 1; else skippedRows += 1;
        if (result.created) createdActivities += 1;
      });
    });
    if (!importedRows) throw new Error("没有识别到可合并的数据行，请检查活动名称、月份/日期和指标表头");
    saveState();
    renderNavigation();
    if (ui.view === "activity") renderActivity(); else renderHome();
    showToast(`已合并 ${importedRows} 行，新增 ${createdActivities} 个活动${skippedRows ? `，跳过 ${skippedRows} 行` : ""}。`, 4200);
  }

  function modeFromRecord(record) {
    const modeText = String(record.mode || "");
    if (/转化|conversion/i.test(modeText)) return "conversion";
    if (/业绩|performance/i.test(modeText)) return "performance";
    if (["couponReceived", "couponRedeemed", "couponAmount", "participants"].some((field) => record[field] !== "" && record[field] !== undefined)) return "conversion";
    return "performance";
  }

  function mergeImportedRecord(record) {
    const target = importTargetActivityId ? state.activities.find((activity) => activity.id === importTargetActivityId) : null;
    const rawName = String(record.activity || target?.name || "").trim();
    if (!rawName) return { imported: false, created: false };
    const normalizedName = normalizeHeader(rawName);
    let activity = state.activities.find((item) => normalizeHeader(item.name) === normalizedName);
    let created = false;
    if (!activity) {
      activity = { id: uid("act"), name: rawName, mode: modeFromRecord(record), data: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      state.activities.push(activity); created = true;
    }
    const monthHint = parseMonthValue(record.month) || (target && target.id === activity.id ? ui.month : null);
    const date = parseDateValue(record.date, monthHint, record.day);
    if (!date) {
      if (created) state.activities = state.activities.filter((item) => item.id !== activity.id);
      return { imported: false, created: false };
    }
    const row = activity.data[date] || {};
    let hasImportedValue = false;
    MODE_DEFS[activity.mode].metrics.forEach((metric) => {
      const value = parseNumber(record[metric]);
      if (value !== null) { row[metric] = value; hasImportedValue = true; }
    });
    if (record.note !== undefined && String(record.note).trim()) { row.note = String(record.note).trim(); hasImportedValue = true; }
    if (!hasImportedValue) {
      if (created) state.activities = state.activities.filter((item) => item.id !== activity.id);
      return { imported: false, created: false };
    }
    activity.data[date] = row;
    activity.updatedAt = new Date().toISOString();
    return { imported: true, created };
  }

  function bindEvents() {
    document.querySelector('[data-view="home"]').addEventListener("click", openHome);
    ["#newActivityButton", "#quickAddActivity", "#emptyNewActivity"].forEach((selector) => $(selector).addEventListener("click", () => showModal(els.activityModal)));
    $("#newTodoButton").addEventListener("click", () => openTodoModal());
    document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => hideModal($(`#${button.dataset.closeModal}`))));
    [els.activityModal, els.todoModal].forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal) hideModal(modal); }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { hideModal(els.activityModal); hideModal(els.todoModal); els.sidebar.classList.remove("open"); }
    });
    els.activityForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = els.activityNameInput.value.trim();
      const mode = new FormData(els.activityForm).get("activityMode");
      if (state.activities.some((activity) => normalizeHeader(activity.name) === normalizeHeader(name))) { showToast("活动名称已存在，请换一个名称。", 3000); return; }
      createActivity(name, mode);
    });
    els.todoForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = { date: $("#todoDate").value, subject: $("#todoSubject").value.trim(), owner: $("#todoOwner").value.trim(), content: $("#todoContent").value.trim() };
      const editingTodo = state.todos.find((todo) => todo.id === editingTodoId);
      if (editingTodo) {
        Object.assign(editingTodo, values, { updatedAt: new Date().toISOString() });
      } else {
        state.todos.push({ id: uid("todo"), ...values, completed: false, createdAt: new Date().toISOString() });
      }
      const message = editingTodo ? "待办已更新。" : "待办已添加。";
      saveState(); hideModal(els.todoModal); els.todoForm.reset(); editingTodoId = null; renderHome(); showToast(message, 1800);
    });
    els.activityNav.addEventListener("click", (event) => { const button = event.target.closest("[data-activity-id]"); if (button) openActivity(button.dataset.activityId, button.dataset.month); });
    els.activityCards.addEventListener("click", (event) => { const card = event.target.closest("[data-activity-card]"); if (card) openActivity(card.dataset.activityCard, card.dataset.month); });
    els.activityCards.addEventListener("keydown", (event) => { const card = event.target.closest("[data-activity-card]"); if (card && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openActivity(card.dataset.activityCard, card.dataset.month); } });
    els.todoList.addEventListener("change", (event) => {
      const item = event.target.closest("[data-todo-id]"); if (!item || !event.target.matches(".todo-check")) return;
      const todo = state.todos.find((entry) => entry.id === item.dataset.todoId); if (!todo) return;
      todo.completed = event.target.checked; saveState(); renderHome();
    });
    els.todoList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-todo-id]"); if (!item) return;
      const todo = state.todos.find((entry) => entry.id === item.dataset.todoId); if (!todo) return;
      if (event.target.closest(".todo-edit")) { openTodoModal(todo); return; }
      if (!event.target.closest(".todo-delete")) return;
      state.todos = state.todos.filter((entry) => entry.id !== item.dataset.todoId); saveState(); renderHome();
    });
    els.logoButton.addEventListener("click", () => {
      if (state.branding?.logo) {
        if (!confirm("确定删除当前 LOGO 吗？")) return;
        state.branding.logo = null; saveState(); renderLogo(); showToast("LOGO 已删除。", 1800); return;
      }
      els.logoFileInput.click();
    });
    els.logoFileInput.addEventListener("change", async () => {
      const file = els.logoFileInput.files[0];
      if (!file) return;
      try {
        if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
        if (file.size > 8 * 1024 * 1024) throw new Error("图片不能超过 8MB");
        state.branding ||= { logo: null };
        state.branding.logo = await resizeLogo(file);
        saveState(); renderLogo(); showToast("LOGO 已上传并保存。", 2000);
      } catch (error) {
        showToast(`LOGO 上传失败：${error.message}`, 3500);
      } finally {
        els.logoFileInput.value = "";
      }
    });
    els.dataTableBody.addEventListener("input", handleTableInput);
    els.monthPicker.addEventListener("change", () => changeActivityMonth(els.monthPicker.value || todayMonth));
    $("#prevMonth").addEventListener("click", () => changeActivityMonth(shiftMonth(ui.month, -1)));
    $("#nextMonth").addEventListener("click", () => changeActivityMonth(shiftMonth(ui.month, 1)));
    els.homeMonthPicker.addEventListener("change", () => { ui.homeMonth = els.homeMonthPicker.value || todayMonth; renderNavigation(); renderHome(); rememberUI(); });
    $("#homePrevMonth").addEventListener("click", () => { ui.homeMonth = shiftMonth(ui.homeMonth, -1); renderNavigation(); renderHome(); rememberUI(); });
    $("#homeNextMonth").addEventListener("click", () => { ui.homeMonth = shiftMonth(ui.homeMonth, 1); renderNavigation(); renderHome(); rememberUI(); });
    $("#renameActivity").addEventListener("click", () => {
      const activity = getActivity(); if (!activity) return;
      const name = prompt("请输入新的活动名称", activity.name)?.trim(); if (!name || name === activity.name) return;
      if (state.activities.some((item) => item.id !== activity.id && normalizeHeader(item.name) === normalizeHeader(name))) { showToast("已有同名活动。", 2200); return; }
      activity.name = name; activity.updatedAt = new Date().toISOString(); saveState(); renderNavigation(); renderActivity();
    });
    $("#deleteActivity").addEventListener("click", () => {
      const activity = getActivity(); if (!activity || !confirm(`确定删除“${activity.name}”及其全部每日数据吗？此操作不可撤销。`)) return;
      state.activities = state.activities.filter((item) => item.id !== activity.id); saveState(); openHome(); showToast("活动已删除。", 2000);
    });
    $("#exportJsonButton").addEventListener("click", exportJson);
    $("#exportExcelButton").addEventListener("click", exportExcel);
    [els.exportActivitySelect, els.exportMonthSelect, els.exportFormatSelect].forEach((select) => select.addEventListener("change", updateExportPreview));
    els.exportTableButton.addEventListener("click", () => exportScopedTable(els.exportActivitySelect.value, els.exportMonthSelect.value, els.exportFormatSelect.value));
    $("#importButton").addEventListener("click", () => { importTargetActivityId = null; els.fileInput.click(); });
    $("#activityImportButton").addEventListener("click", () => { importTargetActivityId = ui.activityId; els.fileInput.click(); });
    els.fileInput.addEventListener("change", () => handleImport(els.fileInput.files[0]));
    $("#mobileMenu").addEventListener("click", () => els.sidebar.classList.toggle("open"));
  }
  function changeActivityMonth(month) {
    ui.month=month; $("#eventDate").value=""; $("#eventForm").reset(); editingEventId=null; $("#eventSubmit").textContent="添加标记";
    renderNavigation();renderActivity();rememberUI();
  }

  function bindAnalysisEvents() {
    window.addEventListener("dashboard-save-status", (e) => showSaveStatus(e.detail));
    ["homeCompareMode","activityCompareMode"].forEach((id) => $("#"+id).addEventListener("change", (e) => {
      ui.compareMode=e.target.value;rememberUI();
      if(ui.view==='home') renderHomeAnalysis();else {renderMetricSummary(getActivity());renderActivityAnalysis(getActivity());renderCharts();}
    }));
    $("#activityRanking").addEventListener("change", (e)=>{ui.ranking=e.target.value;renderHomeAnalysis();rememberUI();});
    $("#comparisonRows").addEventListener("click", (e)=>{const el=e.target.closest('[data-analysis-activity]');if(el) openActivity(el.dataset.analysisActivity,ui.homeMonth);});
    $("#eventForm").addEventListener("submit", (e)=>{
      e.preventDefault();const activity=getActivity();if(!activity)return;
      const date=$("#eventDate").value,note=$("#eventNote").value.trim(),kind=$("#eventKind").value;
      if(!Analysis.validDate(date)||!note)return;
      activity.events ||= [];
      const existing=activity.events.find((item)=>item.id===editingEventId);
      if(existing) Object.assign(existing,{date,note,kind});else activity.events.push({id:uid('event'),date,note,kind});
      activity.updatedAt=new Date().toISOString();saveState();editingEventId=null;$("#eventForm").reset();$("#eventSubmit").textContent='添加标记';renderEvents(activity);renderCharts();
    });
    $("#eventCancel").addEventListener("click",()=>{editingEventId=null;$("#eventForm").reset();$("#eventSubmit").textContent='添加标记';renderEvents(getActivity());});
    $("#eventList").addEventListener("click",(e)=>{
      const edit=e.target.closest('[data-event-edit]'),del=e.target.closest('[data-event-delete]'),activity=getActivity();if(!activity)return;
      if(edit){const item=activity.events.find((v)=>v.id===edit.dataset.eventEdit);if(!item)return;editingEventId=item.id;$("#eventDate").value=item.date;$("#eventKind").value=item.kind;$("#eventNote").value=item.note;$("#eventSubmit").textContent='保存标记';$("#eventNote").focus();}
      if(del && confirm('删除这条运营事件标记？')){activity.events=activity.events.filter((v)=>v.id!==del.dataset.eventDelete);saveState();renderEvents(activity);renderCharts();}
    });
    window.addEventListener('pagehide',rememberUI);
    window.__onSharedStorageUpdate=(keys)=>{
      if(!keys.includes(STORAGE_KEY))return;
      rememberUI();const position={...ui};state=loadState();renderNavigation();
      if(ui.view==='activity'&&getActivity())renderActivity();else openHome();
      restorePosition(position);
    };
  }


  function init() {
    bindEvents();bindAnalysisEvents();renderNavigation();
    const saved={...ui};
    if(ui.view==='activity'&&getActivity()) {els.homeView.hidden=true;els.activityView.hidden=false;renderActivity();}
    else {ui.view='home';renderHome();}
    if(window.__getSharedStorageStatus)showSaveStatus(window.__getSharedStorageStatus());
    requestAnimationFrame(()=>restorePosition(saved));
    if(typeof window.Chart==='undefined'||typeof window.XLSX==='undefined')showToast('本地组件加载不完整，请检查安装包。',5000);
  }

  init();
})();
