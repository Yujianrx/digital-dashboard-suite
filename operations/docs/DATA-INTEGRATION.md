# 数据接入

## 空白起点

`public/data/template.json` 保留完整数据结构，但门店、经营事实、会员、活动、目标和菜品数组全部为空。安装完成后不会出现任何真实或预置经营指标。

## JSON 契约

根对象包含 `schemaVersion`、`meta`、`stores`、`facts`、`overviewFacts`、`targets`、`capacity`、`activities`、`members` 和 `dishes`。详细字段类型见 `src/restaurant/types.ts`，规则见 `validateDataset()`。

- 金额以**分**为单位，展示时转为元。
- 未知和缺失使用 `null`；真实零值可保留。
- 同比和环比基期缺失或为零时不生成虚假百分比。
- 营收和储值实付分别统计，不相加。
- 省市及组织归属由接入方提供；不根据门店名字猜测位置。
- 会员资产的归属、消费门店范围、去重和余额时点需与接入方确认。

私有 JSON 放在被忽略的目录中，通过页面导入或本机 `STATIC_DATA_FILE` 配置接入。

## ClickHouse 适配模板

`.env.local` 至少填写 `CLICKHOUSE_URL`、`CLICKHOUSE_USER`、`CLICKHOUSE_PASSWORD`、`CLICKHOUSE_DATABASE`，按需要填写 `CLICKHOUSE_BRAND`。示例域名不可连接，仓库没有可用账号。

现有映射模板包含门店目录、组织归属、门店日渠道收入、门店日总览、会员档案、储值订单及消费记录。请检查以下文件中的表、字段、类型和状态枚举：

- `server/snapshot-source.mjs`
- `server/database-profile.mjs`
- `server/member-profile.mjs`

SQL 中的 `operations.` 是默认库占位前缀，由只读适配器按合法的 `CLICKHOUSE_DATABASE` 配置绑定；通用品牌占位值由 `CLICKHOUSE_BRAND` 绑定。不同数据库结构仍需调整映射代码，不会自动发现任意私有业务模型。

## 同步与本地读

服务运行期间每天北京时间10:00触发一次同步；错过后启动补同步。首次初始化和显式 `npm run sync:data` 可立即运行。完整校验前不会覆盖当前有效版本；失败时保留上次成功数据。

`/api/snapshot` 返回同步状态，`/api/dashboard` 返回当前范围的本地结果。正常筛选和普通刷新不会触发源数据库查询。电脑和 API 服务需要运行，关闭服务后没有独立操作系统定时任务代为执行。
