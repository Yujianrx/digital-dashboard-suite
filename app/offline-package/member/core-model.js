(function(root){
'use strict';
const key='member_ops_core_v112',M=root.PlatformModel,D=root.Demo;let cache;
const schema={
 mini:[['received','实收','money','元'],['sales','销量','count','份'],['revenue','营业额','money','元'],['note','备注','text','']],
 member:[['recharge','会员储值实收','money','元'],['memberAmount','会员消费金额','money','元'],['memberCount','消费会员人次','count','人次'],['newMembers','新增会员','count','人'],['note','备注','text','']]
};
const fields=id=>schema[id].map(([id,label,type,unit])=>({id,label,type,unit,aggregate:type==='text'?'none':'sum',enabled:true}));
function read(){if(cache)return cache;const raw=localStorage.getItem(key);const state=raw?JSON.parse(raw):{version:1,modules:{mini:{name:'小程序业绩',rows:{}},member:{name:'会员业绩',rows:{}}}};if(state.version!==1||!state.modules?.mini?.rows||!state.modules?.member?.rows)throw Error('核心业绩数据格式异常，请检查共享备份');cache=state;return state}
function save(state){const next={...state,updatedAt:new Date().toISOString()};localStorage.setItem(key,JSON.stringify(next));cache=next;return next}
function rename(id,name){name=String(name).trim();if(!name||name.length>24||/[\x00-\x1f]/.test(name))throw Error('模块名称需为 1–24 个字，不能包含换行');if(Object.entries(read().modules).some(([k,v])=>k!==id&&v.name===name))throw Error('两个模块名称不能相同');const next=M.clone(read());next.modules[id].name=name;return save(next)}
function row(id,date){const s=M.read('mini'),source=id==='mini'?M.records('mini')[date]||{}:s.activities.find(a=>a.id===s.rechargeSourceActivityId)?.data?.[date]||{};const base=id==='mini'?{received:source.received,sales:source.sales,revenue:source.revenue,note:source.note}:{recharge:source.received};return {...base,...read().modules[id].rows[date]}}
function transaction(date){const a=row('mini',date),b=row('member',date),out={};for(const [id,r] of [['mini',a],['member',b]])for(const f of fields(id).filter(f=>f.type!=='text')){const v=r[f.id];out[f.id]=v==null||v===''||!Number.isFinite(Number(v))?null:Number(v)}return out}
function summary(ds){const out={};for(const f of [...fields('mini'),...fields('member')].filter(f=>f.type!=='text')){const rows=ds.map(d=>transaction(d)[f.id]).filter(v=>v!==null);out[f.id]=rows.length?rows.reduce((sum,v)=>sum+v,0):null;out[f.id+'Days']=rows.length}return out}
function source(id,ds){const s=M.read('mini'),a=s.activities.find(a=>a.id===(id==='mini'?s.dailySourceActivityId:s.rechargeSourceActivityId)),imported=ds.filter(d=>Object.values(read().modules[id].rows[d]||{}).some(v=>v!=null&&v!=='')).length;return (imported?'已导入 '+imported+' 天；缺项沿用':'关联')+(a?.name||(id==='mini'?'平台每日数据':'未配置来源'))}

// Legacy sales is an order count only for these verified source activity IDs.

function ticketSource(id){const s=M.read('mini'),ref=id==='mini'?s.dailySourceActivityId:s.rechargeSourceActivityId;return root.DashboardBusinessScopes?.[ref]?.kind===(id==='mini'?'orders':'recharge')?s.activities.find(a=>a.id===ref):null}
function ticketField(id){return {id:'averageTicket',label:id==='member'?'储值客单价':'客单价',type:'money',unit:'元/单',aggregate:'ratio',derived:true}}
function finiteValue(value){if((typeof value!=='number'&&typeof value!=='string')||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)?n:null}
function averageTicket(id,ds){
 const source=ticketSource(id),dates=[...new Set(ds)],formula=id==='member'?'储值实收 ÷ 储值订单数':'实收 ÷ 有效订单数';let amount=0,orders=0,days=0;
 if(source)for(const date of dates){const r=row(id,date),a=finiteValue(r[id==='member'?'recharge':'received']),n=finiteValue(id==='member'?source.data?.[date]?.sales:r.sales);if(a===null||n===null||!Number.isSafeInteger(n)||n<0)continue;amount+=a;orders+=n;days++}
 const ratio=orders>0?amount/orders:null,value=Number.isFinite(ratio)?ratio:null;
 const coverage='金额与订单数齐全 '+days+' / '+dates.length+' 天';
 const reason=!source?'订单来源未配置或口径待确认':!days?'暂无同日金额与订单数':orders===0?'订单数为 0，暂不计算':!Number.isFinite(ratio)?'数据超出计算范围':'';
 return {value,days,totalDays:dates.length,amount:days?amount:null,orders:days?orders:null,sourceConfirmed:!!source,formula,coverage,note:formula+'；'+coverage+(reason?'；'+reason:'')};
}
function reportFields(id){const fs=fields(id).map(f=>id==='mini'&&f.id==='sales'&&ticketSource(id)?{...f,label:'有效订单数',unit:'单'}:f),at=fs.findIndex(f=>f.type==='text');fs.splice(at<0?fs.length:at,0,ticketField(id));return fs}
function reportRow(id,date){return {...row(id,date),averageTicket:averageTicket(id,[date]).value}}
function reportSummary(id,ds){return {...summary(ds),averageTicket:averageTicket(id,ds).value}}

root.CoreModel={key,fields,read,save,rename,row,source,averageTicket,ticketField,reportFields,reportRow,reportSummary,title:id=>read().modules[id].name,invalidate:()=>{cache=null}};
D.transaction=transaction;D.summary=summary;
})(window);
