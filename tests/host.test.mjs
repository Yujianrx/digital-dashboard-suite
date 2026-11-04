import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cp,mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('isolated Windows host initializes empty data, saves with revision checking and survives restart',{skip:process.platform!=='win32',timeout:30000},async()=>{
 const prefix=join(tmpdir(),'dashboard-public-test-'),directory=await mkdtemp(prefix);
 assert(resolve(directory).startsWith(resolve(prefix))&&resolve(directory).length>resolve(prefix).length);
 let child=null,output='';
 const port=await new Promise(resolvePort=>{const socket=net.createServer().listen(0,'127.0.0.1',()=>{const p=socket.address().port;socket.close(()=>resolvePort(p))})});
 const base='http://127.0.0.1:'+port;
 const stop=async()=>{if(!child)return;const process=child;child=null;if(process.exitCode===null){const closed=once(process,'exit');process.kill();await closed}};
 const start=async()=>{
  child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(directory,'server/dashboard-host.ps1'),'-Port',String(port),'-LoopbackOnly'],{cwd:directory,windowsHide:true,env:{...process.env,DASHBOARD_OPERATIONS_API:''},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',s=>output+=s);child.stderr.on('data',s=>output+=s);
  for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error('Host exited: '+output);try{const r=await fetch(base+'/api/storage');if(r.ok)return await r.json()}catch{}await wait(150)}
  throw Error('Host startup timed out: '+output);
 };
 try{
  await cp(new URL('../server/',import.meta.url),join(directory,'server'),{recursive:true});
  await cp(new URL('../app/',import.meta.url),join(directory,'app'),{recursive:true});
  const before=await start();assert.equal(before.revision,1);const activities=JSON.parse(before.values.activity_data_dashboard_v1).activities;assert(activities.every(a=>Object.keys(a.data).length===0));
  for(const path of ['/','/member/','/activity-data/','/business-dashboard.html','/member/business-scopes.js'])assert.equal((await fetch(base+path)).status,200,path);
  const proxy=await fetch(base+'/operations/api/snapshot');assert.equal(proxy.status,503,'API must stay disconnected until explicitly configured');
  const body={action:'set',key:'test-only-record',value:'synthetic',baseRevision:before.revision};
  const saved=await fetch(base+'/api/storage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(saved.status,200);assert.equal((await saved.json()).revision,2);
  const conflict=await fetch(base+'/api/storage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,value:'must-not-save'})});assert.equal(conflict.status,409);
  await stop();const restored=await start();assert.equal(restored.values['test-only-record'],'synthetic');assert.equal(restored.revision,2);
  assert((await readdir(join(directory,'backups'))).length>0);
 }finally{
  await stop();assert(resolve(directory).startsWith(resolve(tmpdir())+sep)&&directory.startsWith(prefix));await rm(directory,{recursive:true,force:true});
 }
});
