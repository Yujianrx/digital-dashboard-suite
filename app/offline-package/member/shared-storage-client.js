(function () {
  "use strict";

  var isSharedMode = location.protocol === "http:" || location.protocol === "https:";
  var nativeStorage = window.localStorage;
  // One coordinator per same-origin dashboard tab, shared with the activity iframe.
  var parentHub = null;
  try { if (window.parent !== window && window.parent.location.origin === location.origin) parentHub = window.parent.__dashboardSharedHub; } catch (_) {}
  if (isSharedMode && parentHub) {
    window.__dashboardStorageMode = "shared";
    window.__sharedStorageReady = parentHub.ready.then(function () { parentHub.attach(window); return { mode: "shared" }; });
    return;
  }
  var memory = new Map();
  var confirmed = new Map();
  var revision = 0;
  var pendingMutations = new Map();
  var clearPending = false;
  var flushTimer = null;
  var flushPromise = Promise.resolve();
  var writesInFlight = 0;
  var generation = 0;
  var checking = false;
  var blocked = null;
  var clients = new Set();
  var status = { state: "saved", message: "已保存到主机" };
  var clientId = "client-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

  function allValues(storage) {
    var values = {};
    for (var index = 0; index < storage.length; index += 1) {
      var key = storage.key(index);
      if (key !== null) values[key] = storage.getItem(key);
    }
    return values;
  }

  function downloadJson(values, prefix) {
    var payload = {
      format: "dashboard-shared-storage-v1",
      exportedAt: new Date().toISOString(),
      source: isSharedMode ? "lan-server" : "browser-local",
      values: values,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = prefix + "_" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function requestJson(url, options) {
    return fetch(url, Object.assign({ cache: "no-store" }, options || {})).then(function (response) {
      return response.text().then(function (text) {
        var body = text ? JSON.parse(text) : {};
        if (!response.ok) {
          var error = new Error(body.message || ("请求失败：" + response.status));
          error.status = response.status;
          error.body = body;
          throw error;
        }
        return body;
      });
    });
  }

  function showFatal(message) {
    var panel = document.createElement("div");
    panel.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#f7f2ef;font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif;padding:24px";
    panel.innerHTML = '<div style="max-width:560px;background:white;border:1px solid #ead8d0;border-radius:20px;padding:28px;box-shadow:0 20px 70px rgba(86,40,30,.16)"><h2 style="margin:0 0 12px;color:#3d2924">无法连接局域网数据主机</h2><p style="margin:0;color:#765f57;line-height:1.8">' + message + '</p><button onclick="location.reload()" style="margin-top:18px;border:0;border-radius:10px;background:#d92d29;color:white;padding:10px 18px;font-weight:700;cursor:pointer">重新连接</button></div>';
    document.documentElement.appendChild(panel);
  }

  function eachClient(fn) {
    clients.forEach(function (target) {
      try { if (target.closed || target.__dashboardSharedOwner !== window) { clients.delete(target); return; } fn(target); }
      catch (_) { clients.delete(target); }
    });
  }

  function setStatus(next, message) {
    status = { state: next, message: message };
    eachClient(function (target) { target.dispatchEvent(new target.CustomEvent("dashboard-save-status", { detail: status })); });
    var label = document.getElementById("sharedSaveMessage");
    if (label) label.textContent = message;
    var notice = document.getElementById("sharedSaveNotice");
    if (notice) notice.hidden = next !== "error" && next !== "conflict";
  }

  function notifyData(keys, skipLegacyReload) {
    if (!keys.length) return;
    eachClient(function (target) {
      if (typeof target.__onSharedStorageUpdate === "function") target.__onSharedStorageUpdate(keys);
      // Legacy business React state is reloaded only when it is idle, never from an activity save.
      else if (!skipLegacyReload && /^#\/business/.test(target.location.hash) && keys.some(function (key) { return key !== "activity_data_dashboard_v1"; })) target.location.reload();
    });
  }

  function applySnapshot(snapshot, preservePending) {
    var next = new Map(Object.entries(snapshot.values || {}).map(function (pair) { return [pair[0], String(pair[1])]; }));
    var changed = [];
    new Set(Array.from(memory.keys()).concat(Array.from(next.keys()))).forEach(function (key) {
      if (memory.get(key) !== next.get(key)) changed.push(key);
    });
    confirmed = new Map(next);
    if (preservePending) {
      if (clearPending) next.clear();
      pendingMutations.forEach(function (op) { if (op.action === "remove") next.delete(op.key); else next.set(op.key, op.value); });
    }
    memory = next;
    revision = Number(snapshot.revision || 0);
    return changed;
  }

  function queueMutation(key, value, action) {
    generation += 1;
    if (action === "clear") { clearPending = true; pendingMutations.clear(); }
    else pendingMutations.set(String(key), { action: action, key: String(key), value: value });
    if (flushTimer) clearTimeout(flushTimer);
    if (!blocked) {
      setStatus("pending", "待保存…");
      flushTimer = setTimeout(function () { flushMutations().catch(function () {}); }, 500);
    }
  }

  function postOperations(operations, retried) {
    return requestJson("/api/storage", {
      method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ action: "batch", operations: operations, baseRevision: revision, clientId: clientId })
    }).catch(function (error) {
      if (error.status !== 409 || retried) throw error;
      return requestJson("/api/storage").then(function (snapshot) {
        var values = snapshot.values || {};
        // Retry a revision conflict only if the keys being written did not change,
        // or the server already contains this value (lost acknowledgement).
        var safe = operations.every(function (op) {
          if (op.action === "clear") return false;
          var remote = Object.prototype.hasOwnProperty.call(values, op.key) ? String(values[op.key]) : undefined;
          var desired = op.action === "remove" ? undefined : op.value;
          return remote === confirmed.get(op.key) || remote === desired;
        });
        if (!safe) throw error;
        revision = Number(snapshot.revision || 0);
        return postOperations(operations, true);
      });
    });
  }

  function flushMutations() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    if (blocked) return Promise.reject(blocked);
    if (writesInFlight) return flushPromise.then(function () { return flushMutations(); });
    if (!clearPending && !pendingMutations.size) return Promise.resolve();
    var operations = [];
    if (clearPending) operations.push({ action: "clear" });
    pendingMutations.forEach(function (op) { operations.push(op); });
    clearPending = false;
    pendingMutations.clear();
    writesInFlight = 1;
    setStatus("saving", "正在保存到主机…");
    flushPromise = postOperations(operations, false).then(function (result) {
      revision = Number(result.revision);
      operations.forEach(function (op) {
        if (op.action === "clear") confirmed.clear();
        else if (op.action === "remove") confirmed.delete(op.key);
        else confirmed.set(op.key, op.value);
      });
      setStatus(pendingMutations.size || clearPending ? "pending" : "saved", pendingMutations.size || clearPending ? "待保存…" : "已保存到主机");
    }).catch(function (error) {
      // Retain failed writes, with later edits taking priority over earlier values.
      if (!clearPending) operations.forEach(function (op) {
        if (op.action === "clear") clearPending = true;
        else if (!pendingMutations.has(op.key)) pendingMutations.set(op.key, op);
      });
      blocked = error;
      setStatus(error.status === 409 ? "conflict" : "error", error.status === 409
        ? "同一份数据已被他人更新，本次修改仍留在页面。请先导出待保存数据，再加载主机数据核对。"
        : "尚未保存到主机：" + error.message + "。本次修改仍留在页面，可重试保存。");
      throw error;
    }).finally(function () { writesInFlight = 0; });
    return flushPromise.then(function () { if (pendingMutations.size || clearPending) return flushMutations(); });
  }

  function editingOrPending() {
    if (writesInFlight || pendingMutations.size || clearPending || blocked || window.__hasUnsavedFields?.() || document.querySelector("dialog[open]")) return true;
    var editing = false;
    eachClient(function (target) {
      var el = target.document.activeElement;
      if (el && (el.matches("input, textarea, select, [contenteditable=true]") || target.document.querySelector(".modal-backdrop:not([hidden])"))) editing = true;
    });
    return editing;
  }

  function checkSharedRevision() {
    if (checking || editingOrPending()) return;
    checking = true;
    var observedGeneration = generation;
    var observedRevision = revision;
    requestJson("/api/storage").then(function (snapshot) {
      // Do not apply an old response over a write that began during the GET.
      if (editingOrPending() || generation !== observedGeneration || revision !== observedRevision) return;
      if (Number(snapshot.revision) < revision) return;
      var keys = applySnapshot(snapshot, false);
      notifyData(keys);
    }).catch(function () {}).finally(function () { checking = false; });
  }

  function createSharedStorage() {
    return {
      get length() { return memory.size; },
      key: function (index) { return Array.from(memory.keys())[index] || null; },
      getItem: function (key) { return memory.has(String(key)) ? memory.get(String(key)) : null; },
      setItem: function (key, value) { key = String(key); value = String(value); memory.set(key, value); queueMutation(key, value, "set"); },
      removeItem: function (key) { key = String(key); memory.delete(key); queueMutation(key, null, "remove"); },
      clear: function () { memory.clear(); queueMutation(null, null, "clear"); }
    };
  }

  function attach(target) {
    Object.defineProperty(target, "localStorage", { configurable: true, value: createSharedStorage() });
    target.__dashboardSharedOwner = window;
    clients.add(target);
    target.__flushSharedStorage = flushMutations;
    target.__retrySharedStorage = function () { blocked = null; return flushMutations(); };
    target.__reloadSharedStorage = function () { return requestJson("/api/storage").then(function (snapshot) { pendingMutations.clear(); clearPending = false; blocked = null; generation += 1; notifyData(applySnapshot(snapshot, false)); setStatus("saved", "已加载主机数据"); }); };
    target.__getSharedStorageStatus = function () { return status; };
    target.addEventListener("focus", checkSharedRevision);
    target.document.addEventListener("visibilitychange", function () { if (target.document.visibilityState === "visible") checkSharedRevision(); });
    target.addEventListener("beforeunload", function (event) {
      if (writesInFlight || pendingMutations.size || clearPending || blocked) { event.preventDefault(); event.returnValue = ""; }
    });
  }

  function parseBackup(file) {
    return file.text().then(function (text) {
      var parsed = JSON.parse(text);
      var values = parsed && parsed.values ? parsed.values : parsed;
      if (!values || Array.isArray(values) || typeof values !== "object") throw new Error("备份文件格式不正确");
      var normalized = {};
      Object.keys(values).forEach(function (key) {
        if (values[key] !== null && values[key] !== undefined) normalized[String(key)] = String(values[key]);
      });
      return normalized;
    });
  }

  function importToServer(values) {
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(255,255,255,.86);display:grid;place-items:center;font:16px system-ui";
    overlay.textContent = "正在导入并保存到主机…";
    document.body.appendChild(overlay);
    return flushMutations().then(function () {
      Object.keys(values).forEach(function (key) { window.localStorage.setItem(key, values[key]); });
      return flushMutations();
    }).then(function () {
      notifyData(Object.keys(values));
      alert("数据导入成功。");
    }).catch(function (error) {
      // Keep imported values available for backup/retry without reloading the legacy page.
      notifyData(Object.keys(values), true);
      alert("数据导入尚未保存到主机：" + error.message);
    }).finally(function () { overlay.remove(); });
  }

  function installManager() {
    var style = document.createElement("style");
    style.textContent = ".shared-storage-button{position:fixed;right:18px;bottom:18px;z-index:2147483000;border:1px solid #e1c9bf;border-radius:999px;background:#fff;color:#87352f;padding:10px 16px;font:700 13px system-ui,-apple-system,'Microsoft YaHei',sans-serif;box-shadow:0 10px 30px rgba(95,42,31,.18);cursor:pointer}.shared-storage-panel{position:fixed;right:18px;bottom:68px;z-index:2147483000;width:min(330px,calc(100vw - 36px));border:1px solid #e5d3cc;border-radius:18px;background:#fff;padding:18px;box-shadow:0 20px 60px rgba(73,34,26,.22);font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif}.shared-storage-panel h3{margin:0 0 6px;font-size:17px;color:#382723}.shared-storage-panel p{margin:0 0 14px;color:#806a62;font-size:12px;line-height:1.6}.shared-storage-panel button{width:100%;margin-top:8px;border:1px solid #e2cbc2;border-radius:10px;background:#fff8f5;color:#86352f;padding:10px;font-weight:700;cursor:pointer}.shared-storage-panel button.primary{border-color:#d92d29;background:#d92d29;color:#fff}.shared-storage-panel input{display:none}";
    document.head.appendChild(style);
    var button = document.createElement("button");
    button.className = "shared-storage-button";
    button.type = "button";
    button.textContent = isSharedMode ? "共享数据管理" : "导出本机数据";
    document.body.appendChild(button);

    if (!isSharedMode) {
      button.addEventListener("click", function () {
        var prefix = location.pathname.indexOf("/activity-data/") >= 0 ? "会员运营活动效果看板本机数据" : "连锁门店看板本机数据";
        downloadJson(allValues(nativeStorage), prefix);
      });
      return;
    }

    var notice = document.createElement("div");
    notice.id = "sharedSaveNotice";
    notice.hidden = true;
    notice.style.cssText = "position:fixed;z-index:2147483001;right:18px;bottom:70px;max-width:450px;background:#fff7ed;color:#7c3910;border:1px solid #fdba74;border-radius:14px;padding:16px;font:13px/1.7 system-ui;box-shadow:0 8px 30px #0002";
    notice.innerHTML = '<div id="sharedSaveMessage"></div><button data-save-action="retry">重试保存</button> <button data-save-action="export">导出待保存数据</button> <button data-save-action="load">加载主机数据</button>';
    document.body.appendChild(notice);
    notice.addEventListener("click", function (event) {
      var action = event.target.getAttribute("data-save-action");
      if (action === "export") downloadJson(Object.fromEntries(memory), "数字看板待保存数据");
      if (action === "retry") { blocked = null; flushMutations().catch(function () {}); }
      if (action === "load" && confirm("加载主机数据会放弃页面尚未保存的修改。请确认已导出待保存数据。是否继续？")) {
        requestJson("/api/storage").then(function (snapshot) {
          pendingMutations.clear(); clearPending = false; blocked = null; generation += 1;
          notifyData(applySnapshot(snapshot, false)); setStatus("saved", "已加载主机数据");
        }).catch(function (error) { setStatus("error", "加载失败：" + error.message); });
      }
    });
    var panel = document.createElement("div");
    panel.className = "shared-storage-panel";
    panel.hidden = true;
    panel.innerHTML = '<h3>主机共享数据</h3><p>数据保存在主机 SQLite 数据库。其他用户更新后，页面会在重新切回时检查最新内容。</p><button class="primary" data-action="export">导出共享数据备份</button><button data-action="import">导入旧版浏览器备份</button><button data-action="close">关闭</button><input type="file" accept="application/json,.json" />';
    document.body.appendChild(panel);
    var input = panel.querySelector("input");
    button.addEventListener("click", function () { panel.hidden = !panel.hidden; });
    panel.addEventListener("click", function (event) {
      var action = event.target && event.target.getAttribute("data-action");
      if (action === "close") panel.hidden = true;
      if (action === "import") input.click();
      if (action === "export") {
        requestJson("/api/storage").then(function (result) {
          downloadJson(result.values || {}, "数字看板共享数据");
        }).catch(function (error) { alert("导出失败：" + error.message); });
      }
    });
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      parseBackup(file).then(importToServer).catch(function (error) { alert("无法读取备份：" + error.message); });
      input.value = "";
    });
  }

  if (!isSharedMode) {
    window.__dashboardStorageMode = "local";
    window.__sharedStorageReady = Promise.resolve({ mode: "local" });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installManager);
    else installManager();
    return;
  }

  window.__dashboardStorageMode = "shared";
  var hub = { attach: attach, ready: null };
  window.__dashboardSharedHub = hub;
  hub.ready = window.__sharedStorageReady = requestJson("/api/storage").then(function (result) {
    applySnapshot(result, false);
    attach(window);
    setInterval(checkSharedRevision, 15000);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installManager);
    else installManager();
    return { mode: "shared", revision: revision };
  }).catch(function (error) { showFatal("请确认主机服务仍在运行。详细信息：" + error.message); throw error; });
})();
