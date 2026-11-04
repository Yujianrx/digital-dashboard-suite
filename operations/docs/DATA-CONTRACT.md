# 数据契约

完整 TypeScript 定义见 `src/restaurant/types.ts`，运行时校验见 `validateDataset()`。公共模板为 `public/data/template.json`，所有业务数组为空。

| 字段 | 用途 |
| --- | --- |
| `schemaVersion` | 数据包版本，目前为1 |
| `meta` | 模式、来源、标题、时区、金额口径、覆盖日期和警告 |
| `stores` | 门店ID、名称、组织大区、省市和可选坐标 |
| `facts` | 门店日渠道经营记录，金额以分计、缺失值为null |
| `overviewFacts` | 可选门店日总览，避免渠道字段缺失导致总览误算 |
| `targets` | 已明确配置的目标，缺失时不补默认值 |
| `capacity` | 门店容量等扩展记录 |
| `activities` | 活动窗口、覆盖范围及观察记录 |
| `members` | 会员资产、消费、储值和去重口径汇总 |
| `dishes` | 可选菜品事实，未接入时保持为空 |

真实 JSON 入口要求 `meta.mode` 为 `real`。公共空模板保留内部 `demo` 模式标记，只用于显示尚未接入数据的界面。所有金额字段接入时采用分，页面负责转换为元；零和缺失值含义不同。

请将实际导入数据保存在本机被忽略的私有目录，不要提交到仓库。
