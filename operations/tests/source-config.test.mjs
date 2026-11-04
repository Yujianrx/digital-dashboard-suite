import test from "node:test";
import assert from "node:assert/strict";
import { queryClickHouse } from "../server/clickhouse.mjs";

test("generic datasource binds configured schema and encodes brand values without external requests", async () => {
  const names = [
    "CLICKHOUSE_URL",
    "CLICKHOUSE_USER",
    "CLICKHOUSE_PASSWORD",
    "CLICKHOUSE_DATABASE",
    "CLICKHOUSE_BRAND",
  ];
  const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  const originalFetch = globalThis.fetch;
  let body;
  try {
    Object.assign(process.env, {
      CLICKHOUSE_URL: "https://clickhouse.example.invalid:8443",
      CLICKHOUSE_USER: "test",
      CLICKHOUSE_PASSWORD: "unit-test-only",
      CLICKHOUSE_DATABASE: "tenant_analytics",
      CLICKHOUSE_BRAND: "test' brand",
    });
    globalThis.fetch = async (_url, options) => {
      body = options.body;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };
    await queryClickHouse(
      "SELECT * FROM operations.dim_shop WHERE brandName='连锁品牌' AND database='operations' LIMIT 1",
    );
    assert.match(body, /FROM `tenant_analytics`\.dim_shop/);
    assert.ok(
      body.includes(
        "unhex('" + Buffer.from("test' brand").toString("hex") + "')",
      ),
    );
    assert.ok(!body.includes("test' brand"));
    process.env.CLICKHOUSE_DATABASE = "invalid;name";
    await assert.rejects(queryClickHouse("SELECT 1"));
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});
