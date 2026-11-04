import http from 'node:http';
import {readFile, stat, realpath} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readConfig} from './config.mjs';
import {Storage, fault} from './storage.mjs';
import {Auth} from './auth.mjs';

const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
function send(res,status,body,type='application/json; charset=utf-8') {
  const bytes=Buffer.isBuffer(body)?body:Buffer.from(type.startsWith('application/json')?JSON.stringify(body):body);
  res.writeHead(status,{'Content-Type':type,'Content-Length':bytes.length,'Cache-Control':'no-store'});res.end(bytes);
}
async function json(req,max=100*1024*1024) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) throw fault(415,'请使用 application/json');
  if(Number(req.headers['content-length']||0)>max) throw fault(413,'请求过大');
  const chunks=[];let size=0;
  for await(const chunk of req) {size+=chunk.length;if(size>max)throw fault(413,'请求过大');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fault(400,'JSON 格式不正确');}
}
function originGuard(req,config) {
  const expected=config.publicOrigin || 'http://'+req.headers.host;
  if(req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && req.headers.origin!==expected)) throw fault(403,'拒绝跨站写入');
  if(config.mode==='web' && req.headers.origin!==expected) throw fault(403,'网站写入需要同源请求');
}
async function proxy(req,res,config,url) {
  if(req.method!=='GET')throw fault(405,'仅支持只读 GET');
  if(!['/operations/api/snapshot','/operations/api/dashboard'].includes(url.pathname))throw fault(404,'接口不存在');
  if(!config.operationsApi)throw fault(503,'尚未配置自己的经营数据接口；可使用空数据模板');
  try {
    const upstream=await fetch(config.operationsApi+'/api/'+url.pathname.split('/').pop()+url.search,{signal:AbortSignal.timeout(15000),redirect:'error'});
    const content=await upstream.arrayBuffer();
    send(res,upstream.status,Buffer.from(content));
  } catch {throw fault(503,'本机数据接口暂不可用');}
}
async function staticFile(req,res,config,url) {
  let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{throw fault(400,'路径无效');}
  if(pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p=>p.startsWith('.')))throw fault(403,'路径不可访问');
  const root=await realpath(config.webRoot);
  let path=resolve(root,'.'+pathname);
  if(path!==root && !path.startsWith(root+sep))throw fault(403,'路径不可访问');
  let info;try{info=await stat(path);}catch{throw fault(404,'文件不存在');}
  if(info.isDirectory()) {
    if(!url.pathname.endsWith('/')) {res.writeHead(308,{Location:url.pathname+'/'+url.search});res.end();return;}
    path=resolve(path,'index.html');
  }
  let actual;try{actual=await realpath(path);}catch{throw fault(404,'文件不存在');}
  if(!actual.startsWith(root+sep))throw fault(403,'路径不可访问');
  const bytes=await readFile(actual);
  if(req.method==='HEAD'){res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':bytes.length});res.end();}
  else send(res,200,bytes,types[extname(path)]||'application/octet-stream');
}
export function createHost(config=readConfig()) {
  const storage=new Storage(config),auth=config.mode==='web'?new Auth(config):null;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');
    res.setHeader('Referrer-Policy','same-origin');res.setHeader('Cache-Control','no-store');
    try {
      const url=new URL(req.url,'http://localhost');
      // Local mode also checks Host to prevent DNS rebinding into unauthenticated storage.
      if(config.mode==='local' && !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(req.headers.host||''))throw fault(403,'本地模式仅接受本机地址');
      if(!['GET','HEAD','POST'].includes(req.method))throw fault(405,'请求方法不支持');
      if(req.method==='POST')originGuard(req,config);
      if(url.pathname==='/healthz' && req.method==='GET'){send(res,200,{status:'ok',mode:config.mode});return;}
      if(url.pathname==='/api/login' && req.method==='POST') {
        if(!auth)throw fault(404,'本地模式无需登录');
        res.setHeader('Set-Cookie',await auth.login(req,await json(req,8192)));send(res,200,{ok:true});return;
      }
      if(auth && !auth.valid(req) && !['/login.html','/login.js','/runtime-config.js'].includes(url.pathname)) {
        if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/operations/api/'))throw fault(401,'登录已过期，请重新登录后重试保存');
        res.writeHead(302,{Location:'/login.html?next='+encodeURIComponent(url.pathname+url.search)});res.end();return;
      }
      if(url.pathname==='/runtime-config.js' && req.method==='GET') {
        send(res,200,'window.DashboardRuntime='+JSON.stringify({mode:config.mode,storage:'server',basePath:'/'})+';','application/javascript; charset=utf-8');return;
      }
      if(url.pathname==='/api/logout' && req.method==='POST') {
        if(auth)res.setHeader('Set-Cookie',auth.logout(req));send(res,200,{ok:true});return;
      }
      if(url.pathname==='/api/storage' && req.method==='GET'){send(res,200,storage.snapshot());return;}
      if(url.pathname==='/api/revision' && req.method==='GET'){const {revision,updatedAt}=storage.snapshot();send(res,200,{revision,updatedAt});return;}
      if(url.pathname==='/api/storage' && req.method==='POST'){send(res,200,storage.apply(await json(req)));return;}
      if(url.pathname.startsWith('/api/'))throw fault(404,'接口不存在');
      if(url.pathname.startsWith('/operations/api/')){await proxy(req,res,config,url);return;}
      if(!['GET','HEAD'].includes(req.method))throw fault(405,'请求方法不支持');
      await staticFile(req,res,config,url);
    } catch(error) {
      if(res.headersSent){res.destroy();return;}
      const status=error.status||500;
      if(status===500)console.error('Request failed:',error.message);
      send(res,status,{message:status===500?'服务处理失败，请检查服务日志':error.message,...(error.revision!==undefined?{revision:error.revision}:{})});
    }
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  server.on('close',()=>storage.close());
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const config=readConfig(),server=createHost(config);
  server.listen(config.port,config.host,()=>console.log(`Dashboard ${config.mode}: ${config.publicOrigin||'http://'+config.host+':'+config.port}`));
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit(0));server.closeIdleConnections();});
}
