import {monthBounds} from './core.js';

// Historical configuration keys remain readable; they no longer define a funnel.
export const METRICS=[['exposedUsers','曝光'],['claimedUsers','领取'],['participatedUsers','参与']];
const M=()=>window.PlatformModel;
const CONFIRMED_SCOPES = window.DashboardBusinessScopes || {};
const LABELS={coupon:'券活动',product:'商品销量活动',recharge:'储值活动',orders:'小程序营业数据',unknown:'源活动指标'};
const DEFINITIONS={
 coupon:[['couponReceived','券领取数量','count','张'],['couponRedeemed','券核销数量','count','张'],['couponAmount','用券连带消费金额','money','元']],
 product:[['sales','商品销量','count','份'],['revenue','销售金额','money','元'],['received','预计收入','money','元']],
 recharge:[['sales','储值单数','count','单'],['received','实付充值金额','money','元']],
 orders:[['sales','营业订单数','count','单'],['revenue','销售金额','money','元'],['received','预计收入','money','元']],
};

export function activities(){return M().read('mini').activities;}
export function findSource(id){return activities().find(a=>a.id===id);}
export function numericFields(id){return M().scopeFields('mini',id).filter(f=>f.type==='count');}
export function suggestedMap(){return {exposedUsers:'',claimedUsers:'',participatedUsers:''};}

export function sourceProfile(sourceOrId){
 const source=typeof sourceOrId==='string'?findSource(sourceOrId):sourceOrId;
 const confirmed=source&&Object.hasOwn(CONFIRMED_SCOPES,source.id)?CONFIRMED_SCOPES[source.id]:null;
 const kind=confirmed?.kind||(source&&M().activityType('mini',source.id)==='conversion'?'coupon':'unknown');
 const identifiers=confirmed?.identifiers||[];
 let description,limitation;
 if(kind==='recharge'){
  description='整项会员储值活动，包含全部充值方案及现有同步覆盖的充值平台。';
  limitation='当前只有按天汇总，未按储值活动编号 activity_id 筛选。若计划只针对某个方案，需接入带 activity_id 的明细并确认编号后才能精确统计。';
 }else if(kind==='product'){
  description=`整项商品活动，包含全部 ${identifiers.length} 款已确认商品；同一编号的历史改名数据仍计入。`;
  limitation='当前只有整项每日汇总，不能拆出其中部分商品。若计划只包含部分商品，需接入商品编号明细并确认选择。预计收入沿用 foodIncome，不含餐盒收入。';
 }else if(kind==='coupon'){
  description=identifiers.length?`整项券活动，沿用已确认的 ${identifiers.length} 个券模板ID集合，包含该集合中的历史券。`:'整项券活动，沿用源活动原有券模板范围及历史券；本次不变更券集合。';
  limitation='领取、核销统计券张数，连带消费金额沿用现有订单去重规则；不代表去重参与人数。';
 }else if(kind==='orders'){
  description='整项小程序营业日报，沿用已确认渠道、门店及订单口径。';
  limitation='订单数不是商品份数或参与人数；不跨计划或关联活动直接累计。';
 }else{
  description='整项源活动的现有指标，尚未确认专用业务口径。';
  limitation='不根据活动名称猜测业务类型，不自动生成领取、参与人数或转化率。';
 }
 return {kind,label:LABELS[kind],identifiers,description,limitation,dataLevel:'activity_daily',filterAvailable:false};
}

function definitions(source,profile){
 if(DEFINITIONS[profile.kind])return DEFINITIONS[profile.kind].map(([id,label,type,unit])=>({id,label,type,unit,aggregate:'sum'}));
 return source?M().scopeMetrics('mini',source.id).filter(f=>!['participants','participatedUsers','claimedUsers','exposedUsers'].includes(f.id)).map(f=>({...f})):[];
}
export function referencePresentation(activityId){
 const source=findSource(activityId),profile=sourceProfile(source);
 return {source,profile,fields:source?definitions(source,profile):[]};
}

function numberValue(value){
 if(typeof value!=='number'&&typeof value!=='string')return null;
 if(typeof value==='string'&&(!value.trim()||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value.trim())))return null;
 const number=Number(value);return Number.isFinite(number)?number:null;
}
function summarize(data,dates,field){
 const rows=dates.map(date=>({date,value:numberValue(data[date]?.[field.id])})).filter(row=>row.value!==null);
 if(!rows.length)return {field,value:null,days:0,availableDates:[],last:null};
 const sum=rows.reduce((total,row)=>total+row.value,0);
 const value=field.aggregate==='avg'?sum/rows.length:field.aggregate==='last'?rows.at(-1).value:field.aggregate==='none'?null:sum;
 return {field,value,days:rows.length,availableDates:rows.map(row=>row.date),last:rows.at(-1).date};
}
export function activityEffects(plan,ref,month){
 const bounds=monthBounds(month),start=plan.startDate>bounds.start?plan.startDate:bounds.start,end=plan.endDate<bounds.end?plan.endDate:bounds.end;
 const source=ref?findSource(ref.activityId):null,profile=sourceProfile(source),days=[];
 if(start<=end)for(let date=window.Demo.dt(start);window.Demo.iso(date)<=end;date.setDate(date.getDate()+1))days.push(window.Demo.iso(date));
 const cards=source?definitions(source,profile).map(field=>summarize(source.data||{},days,field)):[];
 const dataDates=[...new Set(cards.flatMap(card=>card.availableDates))].sort();
 return {activityId:plan.id,platform:'miniapp',platformRefs:plan.platformRefs,status:source?'linked':ref?'missing_activity':'not_configured',source,profile,start,end,hasRange:start<=end,days,dataDates,dataDays:dataDates.length,metrics:Object.fromEntries(cards.map(card=>[card.field.id,card])),cards,exposure:{configured:false,value:null},participants:{configured:false,value:null},updatedAt:source?.updatedAt||null};
}
export function formatMetric(metric){return metric?.field&&metric.days&&metric.value!==null?M().format(metric.value,metric.field):'—';}

// Read-only: never mutate platform rows, plan references, or synchronization rules.
window.ActivityPlanEffects={activities,findSource,numericFields,suggestedMap,sourceProfile,referencePresentation,activityEffects,formatMetric};
