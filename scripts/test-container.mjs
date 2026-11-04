// CI-only isolated container and volume; credentials are generated for this test.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const name='dashboard-test-'+randomUUID(),volume=name+'-state',origin='http://127.0.0.1:18765',password=randomUUID();
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
async function ready() {for(let i=0;i<60;i++){try{if((await fetch(origin+'/healthz')).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Container startup timeout');}
async function login() {
  const r=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password})});
  assert.equal(r.status,200);return r.headers.get('set-cookie');
}
try {
  docker('run','-d','--name',name,'-p','127.0.0.1:18765:8765','-v',volume+':/var/lib/dashboard','-e','DASHBOARD_PUBLIC_ORIGIN='+origin,'-e','DASHBOARD_ADMIN_PASSWORD='+password,'dashboard-test');
  await ready();assert.equal((await fetch(origin+'/api/storage')).status,401);let cookie=await login();
  const initial=await (await fetch(origin+'/api/storage',{headers:{Cookie:cookie}})).json();
  assert.equal((await fetch(origin+'/api/storage',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'set',key:'container-synthetic',value:'saved',baseRevision:initial.revision})})).status,200);
  docker('restart',name);await ready();cookie=await login();
  assert.equal((await (await fetch(origin+'/api/storage',{headers:{Cookie:cookie}})).json()).values['container-synthetic'],'saved');
  console.log('Container login, save and restart persistence passed.');
} finally {try{docker('rm','-f',name);}catch{}try{docker('volume','rm',volume);}catch{}}
