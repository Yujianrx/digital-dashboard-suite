# 通用数据看板套件

会员运营、活动计划、营业统计与连锁经营大屏，集中在一个本地项目中。

**这是去品牌、无真实业务数据的发布版本。** 首次启动只有空数据结构，不包含真实门店、会员、负责人、活动记录、金额、数据库备份、密钥、品牌图片或原始经营截图。预置的“小程序营业数据”和“会员储值”只是两个空的数据来源。

## 功能

| 模块 | 功能 |
| --- | --- |
| 效果总览 | 小程序与储值业绩、客单价、日期筛选和同期对照 |
| 活动计划 | 单页月度甘特排期、新建/编辑、阶段安排、按活动编号关联效果 |
| 活动数据 | 按活动录入、按券/商品/储值口径展示、Excel/CSV 导入和导出 |
| 门店排行 | 独立导入门店业绩，按所选日期查看排行 |
| 营业统计 | 营业与收款数据分别管理，门店开业日期、对比分析与导出 |
| 经营大屏 | Vue 3 三维地图、会员储值、门店排行、可选只读接口与本地快照 |
| 数据保存 | Windows SQLite 主机存储、保存冲突检测与本地备份 |

## 启动

完整套件使用 **Windows 10/11、Windows PowerShell 5.1+、Node.js 22.13+**。经营大屏子项目可以独立在其他系统运行。

```powershell
git clone https://github.com/zhujiaowo-sudo/-.git digital-dashboard-suite
cd digital-dashboard-suite
npm run setup:operations
npm run build
npm start
```

打开 <http://127.0.0.1:8765/>。如果该端口已被其他项目使用：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File server/dashboard-host.ps1 -Port 18765 -LoopbackOnly
```

只使用会员运营、活动计划和营业统计时可以直接 `npm start`，无需安装大屏依赖。启动参数只对当前 PowerShell 进程允许执行项目脚本，不修改系统执行策略。默认只监听本机；数据库和备份在本项目的 `data/`、`backups/`，与其他安装目录无关。仓库本身不包含数据库，也不会连接原项目的数据服务。

## 使用自己的数据

- 通过各模块的“下载模板”和“导入数据”录入自己的记录。
- 小程序客单价＝实收÷有效订单数；储值客单价＝储值实收÷储值订单数。期间按同日配对数据的合计计算，缺失及零分母显示“—”，不平均每日比值。
- `app/offline-package/member/business-scopes.js` 用于登记已核实的来源类型与编号。不要根据名称猜测关联，也不要把商品份数或券张数当成人数/订单数。
- 活动效果按计划日期与所选月份的交集展示；多个关联逐个查看，不直接叠加。
- 经营大屏默认使用空模板。接入步骤见 [数据说明](docs/DATA.md) 和 [大屏数据接入](operations/docs/DATA-INTEGRATION.md)。未配置时不会查询任何企业数据库。

## 项目结构

```text
app/offline-package/     # 通用会员运营、活动数据与营业统计页面
  member/               # 活动计划与核心业绩源码
  activity-data/        # 独立活动数据页面及导入组件
  business-dashboard.html # 清除内嵌业务数据后的原有营业统计构建页
operations/             # 可重新构建的 Vue / TypeScript 经营大屏源码
server/                 # Windows SQLite 主机、空结构与可选只读代理
scripts/                # 初始化模板、构建和发布检查
tests/                  # 仅使用人工构造数据的测试
docs/                   # 数据接入、隐私与第三方说明
```

营业统计的安装版提供的是单文件构建页，本仓库保留该形式；会员运营、活动计划和经营大屏包含对应源码。大屏构建产物不提交，由 `npm run build` 生成。

## 检查

```powershell
npm test
npm run check:public
npm run test:operations
npm --prefix operations run type-check
```

详见 [隐私和发布范围](docs/PRIVACY.md)、[第三方组件](docs/THIRD-PARTY.md)。第三方组件保留其原始许可；公开上传不更改已有组件的许可条件。
