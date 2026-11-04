# 部署

## 本机开发

Node.js 22.13+，推荐24 LTS。执行 `npm ci --ignore-scripts` 和 `npm run dev`。前端绑定 `127.0.0.1:8112`，API 绑定 `127.0.0.1:8787`。无数据库配置时，可直接使用页面默认的空模板。

## 标准生产构建

执行 `npm run build`，产物位于 `dist/`。`npm run preview` 提供本机预览；自有真实数据模式还需要单独运行 `npm run dev:api`。标准构建仅使用已验收地图资源，未配置时使用业务网络图。

## 接入已有看板

执行 `npm run build:local-board`，静态资源基路径为 `/operations/`。把 `dist/` 内容放入现有看板的对应静态目录，并增加指向 `/operations/` 的入口。

真实模式需要宿主将以下 GET 接口转发至固定的本地 API：

- `/operations/api/snapshot` → `http://127.0.0.1:8787/api/snapshot`
- `/operations/api/dashboard` → `http://127.0.0.1:8787/api/dashboard`

保持查询参数、JSON 响应和状态码；不要把目标地址变成用户可配置的开放代理。源数据库保持后端访问，私有数据目录与静态网站目录分离。

`local-board` 是明确标注的地图开发预览模式。正式上线前需完成地图来源、审图及使用依据检查。该项目只提供接入方式，仓库不包含任意用户机器的宿主服务、局域网地址或安装路径。
