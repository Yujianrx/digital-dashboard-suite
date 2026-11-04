import { Worker } from "node:worker_threads";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SnapshotReader } from "./snapshot-reader.mjs";
import { addDays, shanghaiToday } from "../src/restaurant/model.mjs";
const generationName = /^snapshot-\d{13}-[a-f0-9]{8}\.sqlite$/;
const json = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
};
export function dueCycle(now = new Date()) {
  const today = shanghaiToday(now),
    at = new Date(today + "T10:00:00+08:00");
  return now < at ? addDays(today, -1) : today;
}
export function nextRun(now = new Date()) {
  const today = shanghaiToday(now),
    day = now < new Date(today + "T10:00:00+08:00") ? today : addDays(today, 1);
  return new Date(day + "T10:00:00+08:00").toISOString();
}
export class SnapshotService {
  constructor({
    directory = fileURLToPath(new URL("../.local-data/", import.meta.url)),
    workerFactory = (options) =>
      new Worker(new URL("./snapshot-worker.mjs", import.meta.url), {
        workerData: options,
      }),
    now = () => new Date(),
  } = {}) {
    this.directory = directory;
    this.workerFactory = workerFactory;
    this.now = now;
    this.state = json(join(directory, "sync-state.json")) || {};
    if (this.state.syncing) {
      this.state = {
        ...this.state,
        syncing: false,
        lastError: "上次同步进程已中断，继续使用上次成功快照",
      };
    }
  }
  pointer() {
    const p = json(join(this.directory, "current.json"));
    if (p && !generationName.test(p.generation))
      throw Error("本地快照指针无效");
    return p;
  }
  status() {
    const p = this.pointer(),
      resolved =
        p &&
        p.completedAt >= (this.state.lastAttemptAt || "") &&
        p.cycle >= (this.state.lastAttemptCycle || "");
    return {
      ready: !!p,
      asOf: p?.asOf,
      completedAt: p?.completedAt,
      generation: p?.generation,
      schedule: "每天10:00（北京时间）",
      nextRunAt: nextRun(this.now()),
      syncing: !!this.inFlight,
      progress: this.inFlight ? this.state.progress : undefined,
      lastError: resolved ? null : this.state.lastError || null,
      readMode: "local-only",
    };
  }
  persist(required = false) {
    try {
      mkdirSync(this.directory, { recursive: true });
      const path = join(this.directory, "sync-state.json");
      writeFileSync(path + ".tmp", JSON.stringify(this.state));
      renameSync(path + ".tmp", path);
    } catch {
      this.state.lastError = "本地同步状态写入失败，请检查磁盘空间与目录权限";
      if (required) throw Error(this.state.lastError);
    }
  }
  read(filters) {
    const p = this.pointer();
    if (!p)
      throw Error(
        "本地快照尚未就绪，" +
          (this.inFlight ? "首次同步进行中" : "尚无成功同步数据") +
          "；刷新只读取本地，不会触发数据库查询",
      );
    if (this.reader?.metadata.generation !== p.generation) {
      this.reader?.close();
      this.reader = new SnapshotReader(join(this.directory, p.generation));
    }
    const data = this.reader.read(filters),
      status = this.status();
    data.meta.snapshot = { ...data.meta.snapshot, ...status };
    data.meta.freshness = `数据截至${p.asOf} · 每日10:00同步${status.syncing ? " · 正在同步" : status.lastError ? " · 最近同步失败，保留旧快照" : ""}`;
    if (status.lastError)
      data.meta.warnings.push(
        "最近同步失败，继续使用上次真实快照：" + status.lastError,
      );
    if (status.syncing)
      data.meta.warnings.push("每日同步进行中，当前显示上一版已校验数据。");
    return data;
  }
  async tick() {
    const cycle = dueCycle(this.now()),
      p = this.pointer();
    if (
      this.inFlight ||
      p?.cycle >= cycle ||
      this.state.lastAttemptCycle >= cycle
    )
      return;
    return this.sync(cycle);
  }
  sync(cycle = dueCycle(this.now())) {
    if (this.inFlight) return this.inFlight;
    this.state = {
      lastAttemptCycle: cycle,
      lastAttemptAt: this.now().toISOString(),
      syncing: true,
      progress: "准备每日同步",
      lastError: null,
    };
    this.persist(true);
    this.inFlight = new Promise((resolve) => {
      let worker, completed, error;
      const finish = () => {
        this.state = {
          ...this.state,
          syncing: false,
          progress: completed ? "同步完成" : "同步失败",
          lastError: completed ? null : error || "同步进程未完成",
        };
        this.persist();
        this.inFlight = null;
        this.worker = null;
        if (completed) {
          const current = this.pointer();
          for (const name of readdirSync(this.directory)) {
            if (
              generationName.test(name) &&
              name !== current.generation &&
              name !== current.previousGeneration
            ) {
              try {
                unlinkSync(join(this.directory, name));
              } catch {
                /* An open previous reader can be reclaimed after the next cycle. */
              }
            }
          }
        }
        resolve(completed || null);
      };
      try {
        worker = this.workerFactory({
          directory: this.directory,
          cycle,
          now: this.now(),
        });
        this.worker = worker;
      } catch (e) {
        error = e.message;
        queueMicrotask(finish);
        return;
      }
      worker.on("message", (m) => {
        if (m.type === "progress") {
          this.state.progress = m.message;
          this.persist();
        } else if (m.type === "complete") completed = m.metadata;
        else if (m.type === "failed") error = m.message;
      });
      worker.on("error", (e) => {
        error = e.message;
      });
      worker.on("exit", finish);
    });
    return this.inFlight;
  }
  start() {
    this.tick().catch((e) => {
      this.state.lastError = e.message;
    });
    this.timer = setInterval(
      () =>
        this.tick().catch((e) => {
          this.state.lastError = e.message;
        }),
      60000,
    );
    this.timer.unref();
  }
  close() {
    clearInterval(this.timer);
    this.reader?.close();
    this.reader = null;
  }
}
export const snapshots = new SnapshotService();
