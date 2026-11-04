import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const adapter=await readFile(new URL('../app/offline-package/browser-storage.js',import.meta.url),'utf8');
const client=await readFile(new URL('../app/offline-package/shared-storage-client.js',import.meta.url),'utf8');
async function setup(){
  let fail=false,subscriber,hold=false,release;const persisted={revision:1,values:{deleted:'synthetic'}};
  const copy=()=>structuredClone(persisted);
  const context={console,location:{protocol:'https:',origin:'https://example.invalid',pathname:'/suite/member/',hash:''},
    document:{readyState:'loading',addEventListener(){},getElementById(){return null;},querySelector(){return null;}},
    setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},addEventListener(){},dispatchEvent(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    DashboardRuntime:{mode:'static',storage:'browser',basePath:'/suite/',seed:{deleted:'synthetic'}}};
  context.window=context;context.parent=context;
  // The browser storage getter may itself be forbidden. Static mode uses IndexedDB.
  Object.defineProperty(context,'localStorage',{configurable:true,get(){throw Error('native storage blocked');}});
  vm.createContext(context);vm.runInContext(adapter,context);
  context.createDashboardBrowserBackend=()=>({initialize:async()=>copy(),snapshot:()=>hold?new Promise(resolve=>{release=()=>resolve(copy());}):Promise.resolve(copy()),subscribe:fn=>{subscriber=fn;},commit:async batch=>{
    if(fail)throw Error('quota');if(batch.clear)persisted.values={};
    for(const [key,op] of batch.ops){if(op.remove)delete persisted.values[key];else persisted.values[key]=op.value;}
    persisted.revision++;return copy();
  }});
  vm.runInContext(client,context);await context.__sharedStorageReady;
  return {context,persisted,fail:value=>{fail=value;},changed:()=>subscriber(),hold:()=>{hold=true;},release:()=>{hold=false;release();}};
}
test('real client flush hook propagates failed persistence and retry awaits the write',async()=>{
  const s=await setup();s.fail(true);s.context.localStorage.setItem('pending','keep');
  await assert.rejects(s.context.__flushSharedStorage(),/quota/);assert.equal(s.persisted.values.pending,undefined);
  assert.equal(s.context.__getSharedStorageStatus().state,'error');s.fail(false);await s.context.__retrySharedStorage();
  assert.equal(s.persisted.values.pending,'keep');assert.equal(s.context.__getSharedStorageStatus().state,'saved');
});
test('real client cross-tab refresh notifies removed keys and empty snapshots',async()=>{
  const s=await setup();let changed=[];s.context.__onSharedStorageUpdate=keys=>changed.push(...keys);
  s.persisted.values={};s.persisted.revision++;await s.changed();assert(changed.includes('deleted'));assert.equal(s.context.localStorage.getItem('deleted'),null);
});
test('a refresh that returns after editing begins cannot replace the edit baseline',async()=>{
  const s=await setup();s.hold();s.persisted.values.deleted='other-tab-change';s.persisted.revision++;
  const refreshing=s.changed();s.context.__hasUnsavedFields=()=>true;s.release();await refreshing;
  assert.equal(s.context.localStorage.getItem('deleted'),'synthetic');
  s.context.__hasUnsavedFields=()=>false;await s.changed();assert.equal(s.context.localStorage.getItem('deleted'),'other-tab-change');
});
