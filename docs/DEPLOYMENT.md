# 部署指南

## 本地使用

Node.js 最低版本为 22.13，推荐 24 LTS。Windows、macOS、Linux 使用相同命令：

```sh
npm run setup:operations
npm run build
npm start
```

打开 `http://127.0.0.1:8765/`。仅使用会员运营、活动计划和营业统计时可跳过安装和构建。`npm start` 默认无需登录且只接受本机访问；对外提供服务请使用网站模式。

端口通过 `PORT` 设置，数据和备份路径通过 `DASHBOARD_DATA_DIR`、`DASHBOARD_BACKUP_DIR` 设置。相对路径基于项目根目录，默认是 `data/`、`backups/`。不要同时启动多个写入同一数据库的服务。

## 完整网站：Node.js

1. 克隆仓库，执行安装和构建命令。
2. 复制 `.env.example` 为 `.env`，填写自己的 `DASHBOARD_PUBLIC_ORIGIN`、`DASHBOARD_ADMIN_USER`、`DASHBOARD_ADMIN_PASSWORD`。访问源只包含协议、域名与可选端口，不含路径或结尾斜线。密码至少 12 字符，无默认密码。
3. 运行 `npm run start:web`，读取 `.env` 并启动网站模式。
4. 配置进程管理和 HTTPS 反向代理，参考 `deploy/Caddyfile`。网站部署在域名根路径，代理保留 Origin 请求头。

例如 `DASHBOARD_PUBLIC_ORIGIN=https://dashboard.example.com`。本机验收可使用 `http://127.0.0.1:8765`，其他 HTTP 域名不被接受。更换域名、协议或端口时同步更新配置。

网站采用单管理员账号、12 小时会话和 HttpOnly Cookie；HTTPS 时使用 Secure Cookie。所有登录设备共享一个工作空间，重启服务后需重新登录。登录失败按连接 IP 限流，代理后的用户共享代理 IP 的限额；服务不信任客户端提交的转发 IP。写入只接受同源请求。登录过期时保留待保存修改，可在新窗口登录后返回原页面重试。

## 完整网站：Docker

准备 `.env` 后在项目根目录执行：

```sh
docker compose up -d --build
docker compose logs -f dashboard
```

镜像使用非 root 用户。`dashboard-state` 卷挂载到 `/var/lib/dashboard`，包含数据和备份，容器重建不会删除卷。宿主机端口只绑定 `127.0.0.1:8765`，通过宿主机 HTTPS 代理访问。

更新：拉取代码后再次执行 `docker compose up -d --build`。停止：`docker compose down`。不要使用 `down -v`，该选项会删除数据卷。此方案要求持久化磁盘和单服务实例，不适用于无持久化磁盘的函数托管或多个写入副本。

## 静态站点

```sh
npm run setup:operations
npm run build:static
npm run test:artifact
```

上传 `dist/static/` 中的文件到静态空间，支持 `/` 或 `/项目名/`。通过 HTTP(S) 访问，不以 `file://` 直接打开。构建默认只有空数据，所有录入保存在当前浏览器。首次进入才初始化空结构，清空后刷新不重新注入模板；不同项目路径的数据隔离。

页面右下角提供 JSON 备份导出和导入。导入覆盖同名数据项，操作前有确认。经营大屏导入的契约 JSON 也保存在此浏览器，刷新后恢复。浏览器空间不足或禁止存储时显示失败。清除网站数据会删除记录，请保留备份。

静态演示没有共享服务器、登录或自动业务同步。网站接口不可用时不会自动切换到静态模式。

### GitHub Pages

在 Settings → Pages 选择 GitHub Actions，然后手动运行 **Publish static demo** 工作流。流程检查代码、生成并发布静态包。项目地址通常为 `https://账户名.github.io/digital-dashboard-suite/`，仓库改名会改变此路径。本次代码配置不会自动开启 Pages 或发布演示。

## 备份与迁移

服务器每次成功保存前保留 `dashboard_previous.db`，每日一份备份，清理超过 30 天的每日备份。备份包含业务数据，不应提交到 GitHub。

原 Windows SQLite 使用相同的 `storage`、`meta` 表。迁移前停止旧服务并备份数据库，在独立安装目录把数据库放到新服务的数据目录。启动不覆盖已有数据。新旧服务不要同时打开同一数据库。

浏览器和服务器之间可通过 JSON 备份手动迁移，继续使用 `dashboard-shared-storage-v1` 格式。业务导入模板和指标口径不受部署方式影响。

## 可选经营接口

默认不启动或探测业务接口。通过 `DASHBOARD_OPERATIONS_API=http://127.0.0.1:18787` 显式启用同机只读代理，仅支持 dashboard 和 snapshot 两个 GET 接口。容器内的 `127.0.0.1` 指容器本身，不会自动连接宿主机生产服务。接入另见 `operations/docs/DATA-INTEGRATION.md`。
