(function () {
  "use strict";

  var STORAGE_KEY = "retail-store-open-dates-v1";
  var state = { stores: {}, updatedAt: null };
  var context = { stores: [], period: "week", start: "", end: "" };
  var modal = null;
  var searchText = "";

  function normalizeDate(value) {
    if (!value) return "";
    var text = String(value).trim().replace(/\//g, "-");
    var match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return "";
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  function normalizeStore(value) {
    return String(value || "").trim();
  }

  function readState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (parsed && parsed.stores && typeof parsed.stores === "object") {
        state = { stores: {}, updatedAt: parsed.updatedAt || null };
        Object.keys(parsed.stores).forEach(function (store) {
          var name = normalizeStore(store);
          if (!name) return;
          var record = parsed.stores[store] || {};
          state.stores[name] = {
            openDate: normalizeDate(record.openDate),
            createdFrom: record.createdFrom === "manual" ? "manual" : "migration",
            updatedAt: record.updatedAt || null,
          };
        });
      }
    } catch (error) {
      console.warn("门店开业日期主数据读取失败", error);
    }
  }

  function cloneState() {
    return JSON.parse(JSON.stringify(state));
  }

  function writeState(nextState) {
    nextState.updatedAt = new Date().toISOString();
    state = nextState;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (window.__dashboardStorageMode === "shared" && typeof window.__flushSharedStorage === "function") return window.__flushSharedStorage();
    return new Promise(function (resolve) { setTimeout(resolve, 450); });
  }

  function buildSeedMap(seeds) {
    var map = new Map();
    (seeds || []).forEach(function (item) {
      var name = normalizeStore(item && item.store);
      if (!name) return;
      map.set(name, normalizeDate(item && item.openDate));
    });
    return map;
  }

  function ensureStores(seeds) {
    var seedMap = buildSeedMap(seeds);
    var next = cloneState();
    var changed = false;
    seedMap.forEach(function (openDate, store) {
      if (Object.prototype.hasOwnProperty.call(next.stores, store)) return;
      next.stores[store] = {
        openDate: openDate,
        createdFrom: "migration",
        updatedAt: new Date().toISOString(),
      };
      changed = true;
    });
    if (changed) state = next;
  }

  function getOpenDate(store, fallback) {
    var name = normalizeStore(store);
    if (Object.prototype.hasOwnProperty.call(state.stores, name)) return normalizeDate(state.stores[name].openDate) || null;
    return normalizeDate(fallback) || null;
  }

  function getStoreNamesByRule(rule, seeds) {
    var seedMap = buildSeedMap(seeds);
    var names = new Set(Object.keys(state.stores));
    seedMap.forEach(function (_, store) { names.add(store); });
    return Array.from(names).filter(function (store) {
      return rule(getOpenDate(store, seedMap.get(store)));
    });
  }

  function getOldStoreNames(periodStart, seeds) {
    return getStoreNamesByRule(function (openDate) { return !!openDate && openDate < periodStart; }, seeds);
  }

  function getNewStoreNames(periodStart, periodEnd, seeds) {
    return getStoreNamesByRule(function (openDate) {
      return !!openDate && openDate >= periodStart && openDate <= periodEnd;
    }, seeds);
  }

  function getMissingStoreNames(seeds) {
    return getStoreNamesByRule(function (openDate) { return !openDate; }, seeds);
  }

  function setContext(nextContext) {
    context = Object.assign({}, context, nextContext || {});
    ensureStores(context.stores);
    updateLauncherBadge();
  }

  function statusFor(openDate) {
    if (!openDate) return { label: "未维护", className: "is-missing" };
    if (!context.start || !context.end) return { label: "已维护", className: "is-ready" };
    if (openDate < context.start) return { label: "老店", className: "is-old" };
    if (openDate <= context.end) return { label: context.period === "week" ? "本周新店" : "周期内开业", className: "is-new" };
    return { label: "尚未开业", className: "is-future" };
  }

  function getSortedRows(draft) {
    return Object.keys(draft.stores).map(function (store) {
      return { store: store, openDate: normalizeDate(draft.stores[store].openDate) };
    }).filter(function (row) {
      return !searchText || row.store.toLowerCase().indexOf(searchText.toLowerCase()) >= 0;
    }).sort(function (left, right) {
      var leftMissing = left.openDate ? 1 : 0;
      var rightMissing = right.openDate ? 1 : 0;
      if (leftMissing !== rightMissing) return leftMissing - rightMissing;
      return left.store.localeCompare(right.store, "zh-CN");
    });
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>\"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character];
    });
  }

  function renderRows(draft) {
    if (!modal) return;
    var body = modal.querySelector("[data-store-master-body]");
    var rows = getSortedRows(draft);
    body.innerHTML = rows.length ? rows.map(function (row) {
      var status = statusFor(row.openDate);
      return '<tr data-store="' + escapeHtml(row.store) + '">' +
        '<td><strong>' + escapeHtml(row.store) + '</strong></td>' +
        '<td><input type="date" data-open-date value="' + escapeHtml(row.openDate) + '" /></td>' +
        '<td><span class="store-master-status ' + status.className + '">' + status.label + '</span></td>' +
        '<td><button type="button" class="store-master-clear" data-clear-date>清空日期</button></td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="4" class="store-master-empty">没有匹配的门店</td></tr>';
    var missing = Object.keys(draft.stores).filter(function (store) { return !normalizeDate(draft.stores[store].openDate); }).length;
    modal.querySelector("[data-missing-count]").textContent = String(missing);
    modal.querySelector("[data-total-count]").textContent = String(Object.keys(draft.stores).length);
  }

  function openManager() {
    var draft = cloneState();
    searchText = "";
    modal = document.createElement("div");
    modal.className = "store-master-overlay";
    modal.innerHTML = '<section class="store-master-dialog" role="dialog" aria-modal="true" aria-label="门店开业日期主数据">' +
      '<header><div><p>STORE MASTER DATA</p><h2>门店开业日期</h2><span>老店：开业日期早于周期开始日；本周内开业为新店，下周自动转为老店。</span></div><button type="button" class="store-master-close" data-close aria-label="关闭">×</button></header>' +
      '<div class="store-master-summary"><span>共 <strong data-total-count>0</strong> 家</span><span class="warning">未维护 <strong data-missing-count>0</strong> 家（不计入老店分母）</span><span>当前周期：' + escapeHtml(context.start || "-") + ' 至 ' + escapeHtml(context.end || "-") + '</span></div>' +
      '<div class="store-master-tools"><input type="search" data-search placeholder="搜索门店名称" /><div class="store-master-add"><input type="text" data-new-store placeholder="输入新门店名称" /><input type="date" data-new-date /><button type="button" data-add>新增门店</button></div></div>' +
      '<div class="store-master-table-wrap"><table><thead><tr><th>门店</th><th>开业日期</th><th>当前身份</th><th>操作</th></tr></thead><tbody data-store-master-body></tbody></table></div>' +
      '<footer><small>此表保存在主机数据库，所有局域网用户共享。上传营业数据不会覆盖这里维护的开业日期。</small><div><button type="button" class="secondary" data-close>取消</button><button type="button" class="primary" data-save>保存并重新计算</button></div></footer>' +
    '</section>';
    document.body.appendChild(modal);
    renderRows(draft);

    modal.addEventListener("input", function (event) {
      if (event.target.matches("[data-search]")) {
        searchText = event.target.value.trim();
        renderRows(draft);
        return;
      }
      if (event.target.matches("[data-open-date]")) {
        var row = event.target.closest("tr[data-store]");
        var store = row && row.getAttribute("data-store");
        if (store && draft.stores[store]) {
          draft.stores[store].openDate = event.target.value;
          draft.stores[store].createdFrom = "manual";
          draft.stores[store].updatedAt = new Date().toISOString();
          var badge = row.querySelector(".store-master-status");
          var status = statusFor(normalizeDate(event.target.value));
          badge.className = "store-master-status " + status.className;
          badge.textContent = status.label;
          modal.querySelector("[data-missing-count]").textContent = String(Object.keys(draft.stores).filter(function (name) { return !normalizeDate(draft.stores[name].openDate); }).length);
        }
      }
    });

    modal.addEventListener("click", function (event) {
      if (event.target.matches("[data-close]") || event.target === modal) {
        modal.remove();
        modal = null;
        return;
      }
      if (event.target.matches("[data-clear-date]")) {
        var row = event.target.closest("tr[data-store]");
        var input = row && row.querySelector("[data-open-date]");
        if (input) {
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }
      if (event.target.matches("[data-add]")) {
        var nameInput = modal.querySelector("[data-new-store]");
        var dateInput = modal.querySelector("[data-new-date]");
        var name = normalizeStore(nameInput.value);
        if (!name) return alert("请先输入门店名称");
        if (Object.prototype.hasOwnProperty.call(draft.stores, name)) return alert("该门店已存在，请直接编辑开业日期");
        draft.stores[name] = { openDate: normalizeDate(dateInput.value), createdFrom: "manual", updatedAt: new Date().toISOString() };
        nameInput.value = "";
        dateInput.value = "";
        searchText = "";
        modal.querySelector("[data-search]").value = "";
        renderRows(draft);
        return;
      }
      if (event.target.matches("[data-save]")) {
        event.target.disabled = true;
        event.target.textContent = "正在保存…";
        writeState(draft).then(function () {
          location.reload();
        }).catch(function (error) {
          event.target.disabled = false;
          event.target.textContent = "保存并重新计算";
          alert("保存失败：" + error.message);
        });
      }
    });
  }

  function updateLauncherBadge() {
    var button = document.querySelector(".store-master-launcher");
    if (!button) return;
    var missing = getMissingStoreNames(context.stores).length;
    button.innerHTML = '<span aria-hidden="true">▦</span> 门店开业日期' + (missing ? '<em>' + missing + '</em>' : "");
    button.title = missing ? "还有 " + missing + " 家门店未维护开业日期" : "维护门店开业日期";
  }

  function installLauncher() {
    function tryInstall() {
      if (document.querySelector(".store-master-launcher")) return true;
      var actions = document.querySelector(".topbar-actions");
      if (!actions) return false;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "store-master-launcher";
      button.addEventListener("click", openManager);
      actions.insertBefore(button, actions.querySelector(".source-badge"));
      updateLauncherBadge();
      return true;
    }
    if (tryInstall()) return;
    var observer = new MutationObserver(function () {
      if (tryInstall()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function installStyles() {
    var style = document.createElement("style");
    style.textContent = ".store-master-launcher{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border:1px solid #e5cfc7;border-radius:10px;background:#fff;color:#5b3a32;font:700 12px system-ui,-apple-system,'Microsoft YaHei',sans-serif;cursor:pointer;white-space:nowrap}.store-master-launcher:hover{background:#fff8f5;border-color:#dcaea0}.store-master-launcher em{display:grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#e52b28;color:#fff;font-size:10px;font-style:normal}.store-master-overlay{position:fixed;inset:0;z-index:2147483500;display:grid;place-items:center;padding:24px;background:rgba(45,28,23,.55);backdrop-filter:blur(4px);font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif}.store-master-dialog{display:flex;flex-direction:column;width:min(980px,calc(100vw - 32px));height:min(760px,calc(100vh - 32px));overflow:hidden;border:1px solid #ead7d0;border-radius:22px;background:#fffaf7;box-shadow:0 28px 90px rgba(54,28,20,.3)}.store-master-dialog header{display:flex;justify-content:space-between;gap:20px;padding:22px 26px 18px;border-bottom:1px solid #efdfd8;background:#fff}.store-master-dialog header p{margin:0 0 4px;color:#d92d29;font-size:10px;font-weight:800;letter-spacing:.18em}.store-master-dialog header h2{margin:0;color:#2f211e;font-size:24px}.store-master-dialog header span{display:block;margin-top:6px;color:#7d6861;font-size:13px}.store-master-close{width:36px;height:36px;border:1px solid #ead5cd;border-radius:10px;background:#fff8f5;color:#694940;font-size:24px;cursor:pointer}.store-master-summary{display:flex;flex-wrap:wrap;gap:10px 18px;padding:12px 26px;border-bottom:1px solid #efdfd8;color:#725b54;font-size:12px}.store-master-summary .warning{color:#b24437}.store-master-tools{display:flex;justify-content:space-between;gap:14px;padding:14px 26px}.store-master-tools input{height:38px;border:1px solid #e4d0c8;border-radius:9px;background:#fff;padding:0 11px;color:#382723;outline:none}.store-master-tools input:focus{border-color:#d92d29;box-shadow:0 0 0 3px rgba(217,45,41,.08)}.store-master-tools>[data-search]{width:220px}.store-master-add{display:flex;gap:8px}.store-master-add button{border:0;border-radius:9px;background:#3d2b26;color:#fff;padding:0 14px;font-weight:700;cursor:pointer}.store-master-table-wrap{flex:1;overflow:auto;margin:0 26px;border:1px solid #ead9d2;border-radius:14px;background:#fff}.store-master-table-wrap table{width:100%;border-collapse:collapse}.store-master-table-wrap thead{position:sticky;top:0;z-index:1;background:#f8efeb}.store-master-table-wrap th,.store-master-table-wrap td{padding:11px 14px;border-bottom:1px solid #f0e3de;text-align:left;font-size:13px}.store-master-table-wrap th{color:#795e55;font-size:11px;letter-spacing:.04em}.store-master-table-wrap td:first-child{width:38%;color:#392724}.store-master-table-wrap input[type=date]{height:34px;border:1px solid #e5d3cc;border-radius:8px;padding:0 9px;color:#432f2a}.store-master-status{display:inline-flex;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:800}.store-master-status.is-old{background:#e8f4ec;color:#257448}.store-master-status.is-new{background:#fff0dc;color:#a55c00}.store-master-status.is-missing{background:#fde8e6;color:#b52d29}.store-master-status.is-future{background:#eeeef4;color:#666578}.store-master-status.is-ready{background:#eef2f8;color:#4b607d}.store-master-clear{border:0;background:transparent;color:#a24b41;font-size:12px;cursor:pointer}.store-master-empty{text-align:center!important;color:#967f77!important;padding:42px!important}.store-master-dialog footer{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:16px 26px;border-top:1px solid #ead9d2;background:#fff}.store-master-dialog footer small{max-width:600px;color:#806a63;line-height:1.6}.store-master-dialog footer>div{display:flex;gap:9px}.store-master-dialog footer button{height:38px;border-radius:9px;padding:0 15px;font-weight:700;cursor:pointer}.store-master-dialog footer .secondary{border:1px solid #dfcbc4;background:#fff;color:#6e5048}.store-master-dialog footer .primary{border:0;background:#d92d29;color:#fff}.store-master-dialog footer .primary:disabled{opacity:.65}@media(max-width:900px){.store-master-launcher{width:38px;padding:0;justify-content:center;font-size:0}.store-master-launcher span{font-size:14px}.store-master-launcher em{position:absolute;margin:-28px 0 0 28px;font-size:9px}.store-master-tools{flex-direction:column}.store-master-tools>[data-search]{width:100%}.store-master-add{flex-wrap:wrap}.store-master-add input:first-child{flex:1}.store-master-dialog footer{align-items:flex-end}.store-master-dialog footer small{font-size:10px}}";
    document.head.appendChild(style);
  }

  window.__businessStoreMaster = {
    ensureStores: ensureStores,
    getOpenDate: getOpenDate,
    getOldStoreNames: getOldStoreNames,
    getNewStoreNames: getNewStoreNames,
    getMissingStoreNames: getMissingStoreNames,
    setContext: setContext,
    open: openManager,
  };

  window.__sharedStorageReady.then(function () {
    readState();
    installStyles();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installLauncher);
    else installLauncher();
  });
})();
