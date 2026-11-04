const identifier = (s) => {
  if (typeof s !== "string" || !/^\w+(?:\.\w+)?$/.test(s))
    throw Error("字段/表标识只能使用字母数字下划线和单个数据库前缀");
  return s
    .split(".")
    .map((v) => "`" + v + "`")
    .join(".");
};
export function assertReadOnly(sql) {
  if (
    typeof sql !== "string" ||
    sql.length > 60000 ||
    !/^\s*(SELECT|SHOW|DESCRIBE)\b/i.test(sql) ||
    /[;]|--|\/\*|\b(INTO|OUTFILE|INFILE|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|TRUNCATE|KILL|GRANT|REVOKE|REMOTE|URL|S3|FILE)\b/i.test(
      sql,
    )
  )
    throw Error("仅允许受控的单条只读查询");
  return sql;
}
export async function queryClickHouse(sql, profile = "default") {
  assertReadOnly(sql);
  if (
    !["default", "member-aggregate", "snapshot", "member-snapshot"].includes(
      profile,
    )
  )
    throw Error("未知只读查询配置");
  if (!process.env.CLICKHOUSE_PASSWORD)
    throw Error("ClickHouse 密码未配置，请在本地 .env.local 填写");
  const url = new URL(
    process.env.CLICKHOUSE_URL || "https://clickhouse.example.invalid:8443",
  );
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("ClickHouse 必须使用 HTTPS，凭据只能通过服务端请求头传递");
  for (const [key, value] of Object.entries({
    readonly: "1",
    max_execution_time: "8",
    max_result_rows: "20000",
    result_overflow_mode: "throw",
    max_rows_to_read: profile.startsWith("member-") ? "5000000" : "1000000",
    read_overflow_mode: "throw",
    max_bytes_to_read: "268435456",
    timeout_overflow_mode: "throw",
    max_memory_usage: profile.startsWith("member-") ? "536870912" : "268435456",
  }))
    url.searchParams.set(key, value);
  if (process.env.CLICKHOUSE_DATABASE)
    url.searchParams.set("database", process.env.CLICKHOUSE_DATABASE);
  const database = process.env.CLICKHOUSE_DATABASE || "operations";
  if (!/^\w+$/.test(database)) throw Error("数据库名称只能包含字母数字下划线");
  const literal = (value) =>
    "unhex('" + Buffer.from(value, "utf8").toString("hex") + "')";
  const boundSql = sql
    .replace(/\boperations\./g, identifier(database) + ".")
    .replace(/'operations'/g, literal(database))
    .replace(
      /'连锁品牌'/g,
      literal(process.env.CLICKHOUSE_BRAND || "连锁品牌"),
    );
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": process.env.CLICKHOUSE_USER || "readonly_user",
        "X-ClickHouse-Key": process.env.CLICKHOUSE_PASSWORD,
        "Content-Type": "text/plain",
      },
      body: boundSql + " FORMAT JSON",
      signal: AbortSignal.timeout(profile.endsWith("snapshot") ? 30000 : 10000),
    });
  } catch {
    throw Error("ClickHouse 连接失败或超时，请检查网络与 HTTPS 证书");
  }
  if (!response.ok)
    throw Error(
      `ClickHouse 只读请求失败（HTTP ${response.status}），请检查账户和字段映射`,
    );
  try {
    return await response.json();
  } catch {
    throw Error("ClickHouse 响应读取失败或超时，请检查网络");
  }
}
export const quoteIdentifier = identifier;
