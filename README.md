# 通用数据看板套件 · Digital Dashboard Suite

支持本地、服务器与静态部署的数据看板套件，涵盖会员运营、活动计划、营业统计与经营大屏，默认空数据，数据自主保存。

**发布版本不含品牌资料或真实业务记录。** 首次启动为空数据，预置的“小程序营业数据”和“会员储值”只是空的数据来源。生产同步、备份和连接凭据不随仓库发布。

## 三种运行方式

| 方式 | 适用场景 | 保存位置 | 入口 |
| --- | --- | --- | --- |
| 本地部署 | 自己电脑使用，Windows / macOS / Linux | 本机 SQLite、自动备份 | `npm start` |
| 完整网站 | 服务器部署，跨设备共享 | 服务器 SQLite、管理员登录 | `npm run start:web` 或 Docker |
| 静态演示 | GitHub Pages 或其他静态空间 | 当前浏览器，按站点路径隔离 | `npm run build:static` |

静态模式不会上传数据或跨设备同步。清除浏览器网站数据会删除记录，请使用备份入口。完整网站采用单管理员、单服务实例，登录设备共享一个工作空间。

## 本地启动

安装 **Node.js 22.13+（推荐 24 LTS）**，无需安装数据库服务。

```sh
git clone https://github.com/Yujianrx/digital-dashboard-suite.git
cd digital-dashboard-suite
npm run setup:operations
npm run build
npm start
```

打开 <http://127.0.0.1:8765/>。仅使用会员运营、活动计划和营业统计时，可以直接 `npm start`；经营大屏需要先安装依赖并构建。

服务默认仅监听本机，数据位于当前项目的 `data/`，备份位于 `backups/`。启动不会覆盖已有记录。原 Windows 入口可通过 `npm run start:legacy` 运行，不能与新服务同时打开同一数据库。

## 网站与静态部署

完整网站：复制 `.env.example` 为 `.env`，填写自己的管理员密码和访问域名。构建后运行 `npm run start:web`，或使用 `docker compose up -d --build`。Docker 使用持久化卷，配合 HTTPS 反向代理访问。

静态版本：运行 `npm run build:static`，上传 **`dist/static/` 中的内容**。支持站点根路径和项目子目录，不包含服务端、数据库或凭据。GitHub Pages 可使用手动触发的发布工作流。

详细步骤、环境变量、备份与迁移见 [部署指南](docs/DEPLOYMENT.md)。

## 功能与口径

| 模块 | 功能 |
| --- | --- |
| 效果总览 | 小程序与储值业绩、客单价、日期筛选和同期对照 |
| 活动计划 | 单页月度甘特排期、执行进度、按活动编号关联效果 |
| 活动数据 | 按券 / 商品 / 储值口径展示、Excel / CSV 导入导出 |
| 门店排行 | 独立导入门店业绩，按所选日期查看排行 |
| 营业统计 | 营业与收款分别管理、开业日期、对比分析与导出 |
| 经营大屏 | Vue 3 三维地图、会员储值、门店排行、可选只读接口 |
| 数据管理 | 服务器保存冲突检测、自动备份；浏览器备份导入导出 |

- 小程序客单价＝实收÷有效订单数；储值客单价＝储值实收÷储值订单数。只对同日金额、数量都有效的记录求合计后相除，分母缺失或为零显示“—”。
- 活动效果取计划日期与所选月份的交集；多个关联分别展示，不默认相加。商品份数、券张数不能当作参与人数，缺失日期不补零。
- 来源类型在 `app/offline-package/member/business-scopes.js` 登记，编号必须经过核实，不按名称猜测。
- 经营接口默认关闭；静态版支持导入契约 JSON，并在当前浏览器保存经营大屏快照。

完整口径和接入方式见 [数据说明](docs/DATA.md)。

## 项目结构

```text
app/offline-package/       # 会员运营、活动数据与营业统计页面
operations/                # Vue / TypeScript 经营大屏源码
server/                    # Node HTTP / SQLite / 认证，以及旧 Windows 入口
scripts/                   # 构建、初始化及发布检查
deploy/                    # HTTPS 反向代理配置示例
tests/                     # 人工构造数据测试
docs/                      # 数据、部署、隐私和第三方说明
```

营业统计保留单文件构建页，其他主要模块包含源码。构建输出、实际数据、环境配置和备份不提交到 Git。

## 验证

```sh
npm test
npm run check:public
npm run test:operations
npm --prefix operations run type-check
npm run build:static
npm run test:artifact
```

CI 覆盖 Windows、Linux、macOS，并独立检查 Docker 登录、保存和重启恢复。发布范围见 [隐私说明](docs/PRIVACY.md)，组件许可见 [第三方说明](docs/THIRD-PARTY.md)。