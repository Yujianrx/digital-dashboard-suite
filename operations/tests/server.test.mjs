import test from "node:test";
import assert from "node:assert/strict";
import { assertReadOnly, quoteIdentifier } from "../server/clickhouse.mjs";
import { createApiServer } from "../server/index.mjs";
test("database queries permit only bounded readonly statements", () => {
  assertReadOnly("SELECT count() FROM analytics");
  assertReadOnly("SHOW TABLES");
  assertReadOnly("DESCRIBE TABLE a");
  for (const q of [
    "INSERT INTO x VALUES(1)",
    "SELECT 1; DROP TABLE x",
    "SELECT * FROM url('x')",
    "SELECT 1 INTO OUTFILE x",
    "SELECT 1 -- comment",
  ])
    assert.throws(() => assertReadOnly(q));
  assert.throws(() => quoteIdentifier("x;DROP"));
  assert.equal(quoteIdentifier("db.table"), "`db`.`table`");
});
test("loopback API rejects writes, invalid dates, unknown source, and does not expose secrets", async () => {
  const server = createApiServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const health = await (await fetch(base + "/api/health")).json();
    assert.equal(health.readOnly, true);
    assert.ok(!JSON.stringify(health).includes("CLICKHOUSE_PASSWORD"));
    assert.equal(
      (await fetch(base + "/api/dashboard", { method: "POST" })).status,
      405,
    );
    assert.equal(
      (
        await fetch(base + "/api/health", {
          headers: { Origin: "https://example.com" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(base + "/api/dashboard?source=demo")).status,
      400,
    );
    assert.equal(
      (
        await fetch(
          base + "/api/dashboard?source=static&start=2026-02-30&end=2026-03-01",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(
          base +
            "/api/dashboard?source=clickhouse&start=2026-01-01&end=2026-10-01",
        )
      ).status,
      400,
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});
