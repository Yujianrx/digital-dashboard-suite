import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),context={console,localStorage:{getItem:()=>null}};
context.window=context;vm.createContext(context);
for(const name of ['data.js','platform-model.js'])vm.runInContext(await readFile(new URL('app/offline-package/member/'+name,root),'utf8'),context);
const {PlatformModel:M,Demo:D}=context;
const miniIds=['sales','revenue','received','couponReceived','couponRedeemed','couponAmount','participants','note'];
const state={};
for(const platform of D.platforms){
 const fields=M.makeFields(platform.id);
 if(platform.id==='mini')for(const f of fields){f.enabled=miniIds.includes(f.id);f.kpi=['sales','revenue','received','couponAmount'].includes(f.id);f.primary=f.id==='received';if(f.id==='sales')f.label='销量';if(f.id==='revenue')f.label='营业额';if(f.id==='received')f.label='实收'}
 state[M.key(platform.id)]={version:11,platform:platform.id,fields,daily:{},activities:[],...(platform.id==='mini'?{dailySourceActivityId:'source-mini-orders',rechargeSourceActivityId:'source-member-recharge'}:{})};
}
state.activity_data_dashboard_v1={version:1,activities:[{id:'source-mini-orders',name:'小程序营业数据',mode:'performance',data:{},events:[]},{id:'source-member-recharge',name:'会员储值',mode:'performance',data:{},events:[]}],todos:[],branding:{logo:null}};
state.member_ops_core_v112={version:1,modules:{mini:{name:'小程序业绩',rows:{}},member:{name:'储值业绩',rows:{}}}};
state.member_ops_plans_v112={schemaVersion:1,revision:0,activities:[]};
state['retail-business-v1']=[];state['retail-payments-v1']=[];state['retail-store-open-dates-v1']={stores:{},updatedAt:null};
await writeFile(new URL('server/initial-state.json',root),JSON.stringify(Object.fromEntries(Object.entries(state).map(([k,v])=>[k,JSON.stringify(v)])),null,2)+'\n');
console.log('Created empty schema; no business observations or store records.');
