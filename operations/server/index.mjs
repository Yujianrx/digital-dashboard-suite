import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadLocalEnv } from "./env.mjs";
import { snapshots as defaultSnapshots } from "./snapshot-service.mjs";
import { defaults, dates, validateDataset } from "../src/restaurant/model.mjs";
export function createApiServer({ snapshots = defaultSnapshots } = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, body) => {
      res.writeHead(status);
      res.end(JSON.stringify(body));
    };
    const origin = req.headers.origin;
    if (
      origin &&
      !/^http:\/\/(127\.0\.0\.1|localhost):(8112|4173)$/.test(origin)
    )
      return send(403, { error: "不接受外部来源" });
    if (!/^((127\.0\.0\.1|localhost):\d+)$/.test(req.headers.host || ""))
      return send(403, { error: "仅允许本机Host" });
    if (req.method !== "GET") return send(405, { error: "仅支持只读GET" });
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/health")
      return send(200, {
        ok: true,
        readOnly: true,
        clickhouseConfigured: !!process.env.CLICKHOUSE_PASSWORD,
      });
    if (url.pathname === "/api/snapshot") {
      try {
        return send(200, snapshots.status());
      } catch {
        return send(503, { error: "本地快照状态不可用，请检查数据服务" });
      }
    }
    if (url.pathname !== "/api/dashboard")
      return send(404, { error: "接口不存在" });
    const fallback = defaults(),
      start = url.searchParams.get("start") || fallback.start,
      end = url.searchParams.get("end") || fallback.end,
      compareMode = url.searchParams.get("compareMode") || "last-month",
      period = url.searchParams.get("period") || "month";
    try {
      dates(start, end);
      if (
        !["last-month", "previous-period"].includes(compareMode) ||
        !["month", "range"].includes(period)
      )
        throw Error("比较方式或统计粒度无效");
      const source = url.searchParams.get("source");
      let data;
      if (source === "static") {
        try {
          data = validateDataset(
            JSON.parse(
              await readFile(
                resolve(
                  process.env.STATIC_DATA_FILE || "data/dashboard.private.json",
                ),
                "utf8",
              ),
            ),
          );
        } catch {
          throw Error("静态真实数据未配置或契约校验失败");
        }
        if (data.meta.mode !== "real") throw Error("真实静态入口拒绝演示数据");
      } else if (source === "clickhouse")
        data = snapshots.read({
          start,
          end,
          compareMode,
          period,
          regionId: url.searchParams.get("regionId") || "",
          province: url.searchParams.get("province") || "",
          city: url.searchParams.get("city") || "",
          storeId: url.searchParams.get("storeId") || "",
        });
      else throw Error("请选择 static 或 clickhouse");
      send(200, data);
    } catch (error) {
      send(400, { error: error.message || "数据源处理失败" });
    }
  });
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await loadLocalEnv();
  defaultSnapshots.start();
  const port = Number(process.env.API_PORT || 8787),
    server = createApiServer();
  server.on("close", () => defaultSnapshots.close());
  server.on("error", (e) => {
    console.error("本地API启动失败：" + e.code);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`Read-only API http://127.0.0.1:${port}`),
  );
}
