import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),seed=JSON.parse(await readFile(new URL('../server/initial-state.json',import.meta.url),'utf8'));
async function runtime(){
 const memory=new Map(Object.entries(seed));let writes=0;
 const context={console,localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,v);writes++}},Date,JSON,Math,Set,Map};context.window=context;vm.createContext(context);
 for(const file of ['data.js','platform-model.js','business-scopes.js','core-model.js'])vm.runInContext(await readFile(new URL('app/offline-package/member/'+file,root),'utf8'),context);
 function setRows(id,rows){const state=JSON.parse(memory.get('activity_data_dashboard_v1'));state.activities.find(a=>a.id===id).data=rows;memory.set('activity_data_dashboard_v1',JSON.stringify(state));context.PlatformModel.invalidate('mini')}
 return {context,memory,setRows,writes:()=>writes};
}
test('fresh template opens all five platforms with no historical observations',async()=>{
 const {context:c,memory,writes}=await runtime();for(const p of c.Demo.platforms)assert(c.PlatformModel.read(p.id));assert.equal(c.CoreModel.averageTicket('mini',['2026-01-01']).value,null);assert.equal(c.CoreModel.averageTicket('member',['2026-01-01']).value,null);assert.equal(writes(),0);assert.equal(memory.get('member_ops_core_v112'),seed.member_ops_core_v112);
});
test('average ticket uses ratio of paired sums, preserves zero and handles missing days',async()=>{
 const {context:c,setRows}=await runtime();setRows('source-mini-orders',{'2026-01-01':{received:100,sales:1},'2026-01-02':{received:100,sales:9},'2026-01-03':{received:600},'2026-01-04':{received:0,sales:2},'2026-01-05':{received:0,sales:0}});
 const average=c.CoreModel.averageTicket('mini',['2026-01-01','2026-01-02','2026-01-03']);assert.equal(average.value,20);assert.equal(average.days,2);assert.equal(average.totalDays,3);assert.equal(c.CoreModel.averageTicket('mini',['2026-01-04']).value,0);assert.equal(c.CoreModel.averageTicket('mini',['2026-01-05']).value,null);
});
test('recharge uses the configured order source, independent of member counts',async()=>{
 const {context:c,setRows,memory}=await runtime();setRows('source-member-recharge',{'2026-01-01':{received:500,sales:4,revenue:9999}});const core=JSON.parse(memory.get(c.CoreModel.key));core.modules.member.rows['2026-01-01']={memberCount:100,memberAmount:200};memory.set(c.CoreModel.key,JSON.stringify(core));c.CoreModel.invalidate();assert.equal(c.CoreModel.averageTicket('member',['2026-01-01']).value,125);
});
test('source IDs survive rename and an unverified source cannot supply order counts',async()=>{
 const {context:c,setRows,memory}=await runtime();setRows('source-mini-orders',{'2026-01-01':{received:120,sales:3}});const raw=JSON.parse(memory.get('activity_data_dashboard_v1'));raw.activities[0].name='测试改名';memory.set('activity_data_dashboard_v1',JSON.stringify(raw));c.PlatformModel.invalidate('mini');assert.equal(c.CoreModel.averageTicket('mini',['2026-01-01']).value,40);delete c.DashboardBusinessScopes['source-mini-orders'];assert.equal(c.CoreModel.averageTicket('mini',['2026-01-01']).value,null);
});
test('business effects use coupon, product and recharge units with a cross-month intersection',async()=>{
 const {context:c,memory,setRows}=await runtime();globalThis.window=c;
 const effects=await import('../app/offline-package/member/plans/effects.js');
 const raw=JSON.parse(memory.get('activity_data_dashboard_v1'));
 raw.activities.push({id:'test-coupon',name:'测试券',mode:'conversion',data:{'2026-01-31':{couponReceived:5,couponRedeemed:2,couponAmount:80},'2026-02-01':{couponReceived:0}}},{id:'test-product',name:'测试商品',mode:'performance',data:{'2026-01-31':{sales:3,revenue:100,received:80}}});
 memory.set('activity_data_dashboard_v1',JSON.stringify(raw));c.PlatformModel.invalidate('mini');c.DashboardBusinessScopes['test-product']={kind:'product',identifiers:['TEST-PRODUCT']};
 const plan={id:'test-plan',startDate:'2026-01-31',endDate:'2026-02-02',platformRefs:[]};
 const coupon=effects.activityEffects(plan,{activityId:'test-coupon'},'2026-01');assert.equal(coupon.dataDays,1);assert.equal(coupon.metrics.couponReceived.value,5);assert.equal(coupon.metrics.couponReceived.field.unit,'张');assert.equal(coupon.participants.value,null);
 const zero=effects.activityEffects(plan,{activityId:'test-coupon'},'2026-02');assert.equal(zero.metrics.couponReceived.value,0);assert.equal(zero.metrics.couponRedeemed.value,null);
 const product=effects.activityEffects(plan,{activityId:'test-product'},'2026-01');assert.equal(product.metrics.sales.field.unit,'份');assert.equal(product.metrics.received.field.label,'预计收入');
 setRows('source-member-recharge',{'2026-01-31':{sales:2,received:200,revenue:200}});const recharge=effects.activityEffects(plan,{activityId:'source-member-recharge'},'2026-01');assert.equal(recharge.cards.length,2);assert.equal(recharge.metrics.sales.field.unit,'单');assert.equal(recharge.metrics.sales.field.label,'储值单数');
 delete globalThis.window;
});
test('new activity entry and computed-only import contract are retained',async()=>{
 const ui=await readFile(new URL('../app/offline-package/member/platform-ui.js',import.meta.url),'utf8');assert(ui.includes('aria-label="新建小程序活动"'));assert(ui.includes("op==='rename-activity'"));const imports=await readFile(new URL('../app/offline-package/member/import-center.js',import.meta.url),'utf8');assert(imports.includes("const derived=kind==='core'"));
});
test('Windows PowerShell scripts use an explicit UTF-8 signature for every locale',async()=>{
 for(const name of ['dashboard-host.ps1','operations-proxy.ps1']){const bytes=await readFile(new URL('../server/'+name,import.meta.url));assert.equal(bytes.subarray(0,3).toString('hex'),'efbbbf',name+' must retain its UTF-8 BOM for Windows PowerShell 5.1')}
});
