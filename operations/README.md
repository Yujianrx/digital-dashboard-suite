# 连锁经营大屏

此目录是通用数据看板套件的经营大屏子项目。完整套件的本地、网站及静态部署请查看 [根目录说明](../README.md) 和 [部署指南](../docs/DEPLOYMENT.md)。

[![项目检查](https://github.com/Yujianrx/digital-dashboard-suite/actions/workflows/ci.yml/badge.svg)](https://github.com/Yujianrx/digital-dashboard-suite/actions/workflows/ci.yml)
![Vue 3](https://img.shields.io/badge/Vue-3-42b883) ![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6) ![Three.js](https://img.shields.io/badge/Three.js-3D-111827) ![SQLite](https://img.shields.io/badge/SQLite-local%20snapshot-0f80cc)

面向连锁门店经营分析的通用数据看板。基于 **Vue 3 + TypeScript + Vite + ECharts + Three.js**，提供三维省市下钻、渠道分析、会员储值及门店业绩前20名滚动榜单，配套 Node.js 只读接口和每日 SQLite 快照。

**本仓库为去品牌、无真实业务数据版本。** 不含企业名称、品牌图片、真实门店和会员记录、经营指标、活动记录、数据库凭据或原始生产截图。首次打开使用空数据模板，接入自己的数据后再展示指标。

## 功能

| 模块 | 能力 |
| --- | --- |
| 经营总览 | 总营收、客单价、储值实付、订单量；同比与环比；缺失值显示为未配置 |
| 经营分布 | 3D 地图旋转、缩放、视角复位，省市及门店下钻，业务网络备选视图 |
| 渠道分析 | 多渠道营收结构、订单和日期趋势，保持互斥归类 |
| 会员储值 | 会员总量、新增会员、新老客、余额、消费与储值；按数据源口径展示 |
| 门店排行 | 当前范围前20名按营收滚动播放，悬停暂停、暂停/播放和门店下钻 |
| 活动观察 | 活动记录、趋势和观察窗口；没有成本和归因配置时不虚构 ROI |
| 本地快照 | 每天北京时间10:00集中同步，筛选与刷新只读本地；失败保留上一成功版本 |
| 显示与访问 | 全屏、桌面及窄屏布局、指标说明、键盘访问、减少动态效果支持 |

## 快速启动

使用 Node.js **22.13+**，推荐 **24 LTS**。项目采用 Node 内置 SQLite。

```bash
git clone https://github.com/Yujianrx/digital-dashboard-suite.git
cd digital-dashboard-suite/operations
npm ci --ignore-scripts
npm run dev
```

打开 <http://127.0.0.1:8112/>。默认展示空模板，**不需要数据库，也不会自动请求任何企业数据库**。只看界面时可运行 `npm run dev:ui`。

### 接入自己的数据

1. 将 `.env.example` 复制为本机 `.env.local`，填写自己的 HTTPS ClickHouse 地址及只读账号。
2. 按照 [数据接入说明](docs/DATA-INTEGRATION.md) 调整数据源表和字段映射；内置 SQL 是适配模板，不代表任意数据库都可直接连接。
3. 启动 `npm run dev`，使用 `npm run sync:data` 显式初始化本机快照。
4. 数据准备好后，在页面选择“真实数据 · 每日快照”。之后筛选与普通刷新读取本地 SQLite。

也可以按照 [数据契约](docs/DATA-CONTRACT.md) 导入自己的 JSON，或配置私有静态 JSON 入口。不要将这些文件加入 Git。

## 项目结构

```text
.
├─ src/
│  ├─ restaurant/         # 数据契约、聚合模型、样式和业务展示组件
│  ├─ views/index/        # 页面布局与地图入口
│  │  └─ map3d/           # 3D 几何、批处理、场景和交互
│  ├─ components/datav/   # 数据大屏边框组件
│  └─ plugins/           # 图表按需注册
├─ server/               # HTTPS 只读适配器、快照同步和本地 API
├─ scripts/              # 开发启动、数据同步和空模板检查
├─ public/
│  ├─ data/template.json # 所有业务数组均为空
│  └─ maps/              # 地理边界资源与来源清单，不含业务记录
├─ tests/                # 计算、数据质量、地图、只读接口和快照测试
├─ docs/                 # 架构、接入、部署和隐私说明
├─ third_party/          # 第三方许可和来源记录
└─ .github/workflows/    # 持续集成
```

## 常用命令

```bash
npm test                  # 单元测试，输入由测试代码人工构造
npm run type-check        # TypeScript 检查
npm run check:public      # 确认公开模板无业务记录及私有数据文件
npm run build             # 标准生产构建
npm run preview           # 构建后的本机预览
npm run build:local-board # /operations/ 子路径构建
npm run sync:data         # 显式同步自己的数据源
```

详细说明：[架构](docs/ARCHITECTURE.md) · [数据接入](docs/DATA-INTEGRATION.md) · [部署](docs/DEPLOYMENT.md) · [隐私与发布范围](docs/PRIVACY.md)。

## 地图与许可证

地理资源和业务数据相互独立。候选边界资源只用于明确标识的开发预览；正式构建保留来源、授权、审图及完整性校验，未验收时使用业务网络视图。详情见 [地图资源说明](docs/MAPS.md)。

本项目基于 [IofTV-Screen-Vue3](https://github.com/daidaibg/IofTV-Screen-Vue3) 改造，上游 MIT 许可见 [LICENSE](LICENSE)。3D 实现使用 Three.js、d3-geo，并参考相关开源项目，第三方许可见 [third_party](third_party/NOTICE.md)。地图资源的独立使用条件不由代码许可证替代。
