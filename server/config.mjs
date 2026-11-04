import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export function readConfig(env = process.env) {
  const mode = env.DASHBOARD_MODE || 'local';
  if (!['local', 'web'].includes(mode)) throw Error('DASHBOARD_MODE 必须为 local 或 web');
  const host = env.DASHBOARD_HOST || (mode === 'web' ? '0.0.0.0' : '127.0.0.1');
  if (mode === 'local' && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw Error('对外访问请使用 web 模式并配置登录');
  const port = Number(env.PORT || env.DASHBOARD_PORT || 8765);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('端口必须为 1–65535');
  let publicOrigin = env.DASHBOARD_PUBLIC_ORIGIN || '';
  if (publicOrigin) {
    const url = new URL(publicOrigin);
    if (url.origin !== publicOrigin || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw Error('PUBLIC_ORIGIN 仅包含协议、域名和可选端口');
    if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('网站部署须使用 HTTPS；本机测试可使用 HTTP');
  }
  const adminUser = env.DASHBOARD_ADMIN_USER || 'admin';
  const adminPassword = env.DASHBOARD_ADMIN_PASSWORD || '';
  if (mode === 'web' && (!publicOrigin || adminPassword.length < 12)) throw Error('web 模式须配置 PUBLIC_ORIGIN 和至少 12 字符的管理员密码');
  const operationsApi = env.DASHBOARD_OPERATIONS_API || '';
  if (operationsApi && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(operationsApi)) throw Error('经营接口仅接受显式配置的本机 HTTP 端口');
  return {mode, host, port, publicOrigin, adminUser, adminPassword, operationsApi,
    dataDir: resolve(projectRoot, env.DASHBOARD_DATA_DIR || 'data'),
    backupDir: resolve(projectRoot, env.DASHBOARD_BACKUP_DIR || 'backups'),
    webRoot: resolve(projectRoot, 'app/offline-package'),
    seedFile: resolve(projectRoot, 'server/initial-state.json')};
}
