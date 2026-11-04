import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHost} from '../server/host.mjs';
import {readConfig} from '../server/config.mjs';

export async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-node-test-'));
  let server;
  async function start() {
    server = createHost({...readConfig({}), dataDir:join(dir,'data'), backupDir:join(dir,'backups'), port:0, ...overrides});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return 'http://127.0.0.1:' + server.address().port;
  }
  async function stop() { if(server?.listening) { server.closeAllConnections(); await new Promise(r=>server.close(r)); } }
  t.after(async()=>{await stop(); await rm(dir,{recursive:true,force:true});});
  return {base:await start(), start, stop, dir};
}
const post = (base, body, headers={}) => fetch(base+'/api/storage',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});

test('Node host initializes empty data, serves modules, persists and backs up', async t=>{
  const f=await fixture(t), initial=await (await fetch(f.base+'/api/storage')).json();
  assert.equal(initial.revision,1);
  assert(JSON.parse(initial.values.activity_data_dashboard_v1).activities.every(a=>!Object.keys(a.data).length));
  for(const path of ['/','/member/','/activity-data/','/business-dashboard.html','/runtime-config.js']) assert.equal((await fetch(f.base+path)).status,200,path);
  assert.equal((await fetch(f.base+'/operations/api/snapshot')).status,503);
  assert.equal((await post(f.base,{action:'set',key:'synthetic',value:'test-only',baseRevision:1})).status,200);
  await f.stop(); f.base=await f.start();
  const saved=await (await fetch(f.base+'/api/storage')).json();
  assert.equal(saved.values.synthetic,'test-only'); assert.equal(saved.revision,2);
  assert((await readdir(join(f.dir,'backups'))).some(n=>n.endsWith('.db')));
});
test('revision conflicts, invalid batches and clear are atomic across restart', async t=>{
  const f=await fixture(t);
  const requests=await Promise.all(['a','b'].map(value=>post(f.base,{action:'set',key:'same',value,baseRevision:1})));
  assert.deepEqual(requests.map(r=>r.status).sort(),[200,409]);
  assert.equal((await post(f.base,{action:'batch',baseRevision:2,operations:[{action:'set',key:'partial',value:'no'},{action:'invalid'}]})).status,400);
  assert.equal((await (await fetch(f.base+'/api/storage')).json()).values.partial,undefined);
  assert.equal((await post(f.base,{action:'clear'})).status,400,'revision is required');
  assert.equal((await post(f.base,{action:'clear',baseRevision:2})).status,200);
  await f.stop(); f.base=await f.start();
  assert.deepEqual((await (await fetch(f.base+'/api/storage')).json()).values,{});
});
test('host rejects foreign writes, invalid bodies and private file access', async t=>{
  const f=await fixture(t);
  assert.equal((await post(f.base,{action:'clear',baseRevision:1},{Origin:'https://foreign.invalid'})).status,403);
  for(const path of ['/server/initial-state.json','/.git/config','/data/dashboard.db','/%2e%2e%2fpackage.json']) assert.notEqual((await fetch(f.base+path)).status,200,path);
  assert.equal((await fetch(f.base+'/api/storage',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await fetch(f.base+'/api/storage',{method:'PUT'})).status,405);
});
test('configuration requires web credentials and explicit public origin',()=>{
  assert.throws(()=>readConfig({DASHBOARD_MODE:'web'}));
  assert.throws(()=>readConfig({DASHBOARD_HOST:'0.0.0.0'}));
  assert.throws(()=>readConfig({PORT:'oops'}));
  assert.throws(()=>readConfig({DASHBOARD_OPERATIONS_API:'https://external.invalid'}));
});
