import { loadLocalEnv } from "../server/env.mjs";
import { queryClickHouse, quoteIdentifier } from "../server/clickhouse.mjs";
await loadLocalEnv();
try {
  const table = process.argv[2];
  const sql = table
    ? "DESCRIBE TABLE " + quoteIdentifier(table)
    : "SHOW TABLES";
  const result = await queryClickHouse(sql);
  console.log(JSON.stringify(result.data, null, 2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
