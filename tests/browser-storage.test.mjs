import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../app/offline-package/browser-storage.js',import.meta.url),'utf8');
function setup(){
 const sites=new Map();const context={window:{}};vm.runInNewContext(source,context);let failure=null,chain=Promise.resolve();
 const transaction=callback=>{const next=chain.then(callback);chain=next.catch(()=>{});return next;};
 const snapshot=path=>structuredClone(sites.get(path));
 return {sites,fail:error=>{failure=error;},create:async(path,seed={},onChange)=>{
  const backend={initialize:values=>transaction(()=>{if(!sites.has(path))sites.set(path,{revision:1,values:{...values}});return snapshot(path);}),snapshot:()=>transaction(()=>snapshot(path)),subscribe:()=>{},commit:batch=>transaction(()=>{
   if(failure)throw failure;const next=snapshot(path);
   if(batch.clear&&batch.revision!==next.revision)throw Object.assign(Error('conflict'),{status:409});
   if(batch.clear)next.values={};
   for(const [key,op] of batch.ops){const existing=Object.hasOwn(next.values,key)?next.values[key]:undefined;if(!batch.clear&&existing!==op.expected&&existing!==(op.remove?undefined:op.value))throw Object.assign(Error('conflict'),{status:409});if(op.remove)delete next.values[key];else Object.defineProperty(next.values,key,{value:op.value,writable:true,enumerable:true,configurable:true});}
   next.revision++;sites.set(path,next);return snapshot(path);
  })};
  const storage=context.window.createDashboardBrowserStorage(backend,path,seed,onChange);await storage.ready;return storage;
 }};
}
test('static data is path scoped, seeded once, preserves zero and clears persistently',async()=>{
 const {create}=setup(),a=await create('/a/',{empty:'{}'}),b=await create('/b/');a.setItem('metric','0');await a.flush();assert.equal(a.getItem('metric'),'0');assert.equal(b.getItem('metric'),null);
 assert.equal((await create('/a/',{other:'no'})).getItem('other'),null);a.clear();await a.flush();assert.equal((await create('/a/',{empty:'{}'})).length,0);
 a.setItem('__proto__','safe');await a.flush();assert.equal(a.getItem('__proto__'),'safe');
});
test('browser import is atomic and failed values remain exportable',async()=>{
 const s=setup();let status='';const a=await s.create('/',{kept:'yes'},state=>status=state);s.fail(Error('quota'));
 await assert.rejects(a.importValues({new:'value'}),/quota/);assert.equal(status,'error');assert.deepEqual(s.sites.get('/').values,{kept:'yes'});assert.equal(a.exportPending().new,'value');
});
test('concurrent distinct-key writes merge and same-key conflicts reject stale data',async()=>{
 const s=setup(),a=await s.create('/'),b=await s.create('/');a.setItem('a','one');b.setItem('b','two');await Promise.all([a.flush(),b.flush()]);await Promise.all([a.refresh(),b.refresh()]);
 assert.equal(a.getItem('b'),'two');assert.equal(b.getItem('a'),'one');
 a.setItem('same','first');b.setItem('same','second');const results=await Promise.allSettled([a.flush(),b.flush()]);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(s.sites.get('/').values.same,'first');
});
test('failed writes survive unrelated edits and retry merges with other tabs',async()=>{
 const s=setup();let status='';const a=await s.create('/',{},state=>status=state),b=await s.create('/');s.fail(Error('quota'));
 a.setItem('plan','pending');await assert.rejects(a.flush(),/quota/);a.setItem('small','edit');await assert.rejects(a.flush(),/quota/);assert.equal(status,'error');
 s.fail(null);b.setItem('other-tab','keep');await b.flush();await a.flush();assert.equal(a.getItem('plan'),'pending');assert.equal(a.getItem('other-tab'),'keep');assert.equal(status,'saved');assert.equal(a.hasPending(),false);
});
test('plan retry after browser quota failure actually persists the pending plan',async()=>{
 const s=setup();let status={state:'saved'};const a=await s.create('/',{},(state,message)=>status={state,message});
 const oldWindow=globalThis.window,oldStorage=globalThis.localStorage;globalThis.localStorage=a;globalThis.window={__sharedStorageReady:a.ready,__getSharedStorageStatus:()=>status,__flushSharedStorage:()=>a.flush(),__retrySharedStorage:()=>a.flush()};
 try{
  const {ActivityRepository}=await import('../app/offline-package/member/plans/repository.js');const repo=new ActivityRepository();s.fail(Error('quota'));
  const plan={title:'虚构测试计划',type:'其他活动',startDate:'2026-11-04',endDate:'2026-11-04',rule:'',stages:[],platformRefs:[]};
  await assert.rejects(repo.create(plan),/quota/);a.setItem('small','value');await assert.rejects(a.flush(),/quota/);s.fail(null);
  assert.equal((await repo.create(plan)).activity.title,plan.title);assert.equal(JSON.parse(s.sites.get('/').values.member_ops_plans_v112).activities.length,1);
 }finally{globalThis.window=oldWindow;globalThis.localStorage=oldStorage;}
});