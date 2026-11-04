(function(root){
'use strict';
const D=root.Demo,cache=new Map(),key=id=>'member_ops_v11_'+id;
const types={count:'整数',money:'金额',number:'数值',percent:'百分比',text:'文本'};
const aggregates={sum:'期间合计',avg:'已录入日均',last:'期末值',none:'不汇总'};
const definitions={
 mini:[['received','支付实收','money','元','sum',1],['orders','支付订单','count','笔','sum',1],['visitors','访问人数','count','人次','sum',1],['newMembers','新增会员','count','人','sum',1],['couponRedeemed','券核销量','count','张','sum',0],['conversion','支付转化率','percent','%','avg',0]],
 video:[['plays','视频播放量','count','次','sum',1],['newFans','新增关注','count','人','sum',1],['likes','点赞量','count','次','sum',1],['received','活动实收','money','元','sum',1],['shares','分享量','count','次','sum',0],['clicks','商品点击量','count','次','sum',0]],
 red:[['reads','笔记阅读量','count','次','sum',1],['collects','收藏量','count','次','sum',1],['leads','咨询人数','count','人次','sum',1],['storeVisits','到店参与人数','count','人次','sum',1],['likes','点赞量','count','次','sum',0],['published','发布笔记数','count','篇','sum',0]],
 douyin:[['received','团购实收','money','元','sum',1],['plays','视频播放量','count','次','sum',1],['orders','团购订单','count','笔','sum',1],['couponRedeemed','团购核销量','count','单','sum',1],['clicks','商品点击量','count','次','sum',0],['newFans','新增粉丝','count','人','sum',0]],
 wechat:[['reads','文章阅读量','count','次','sum',1],['newFans','新增关注','count','人','sum',1],['couponReceived','领券量','count','张','sum',1],['couponRedeemed','核销量','count','张','sum',1],['shares','文章分享量','count','次','sum',0],['clicks','菜单点击量','count','次','sum',0]]
};
const legacy=[['sales','历史销量','count','份','sum',0],['revenue','历史营业额','money','元','sum',0],['received','历史实收','money','元','sum',0],['couponReceived','历史领券量','count','张','sum',0],['couponRedeemed','历史核销量','count','张','sum',0],['couponAmount','历史券消费金额','money','元','sum',0],['participants','历史参与人数','count','人次','sum',0]];
const clone=x=>JSON.parse(JSON.stringify(x));
function uid(prefix='f'){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
function options(type){return type==='text'?['none']:type==='percent'?['avg','last']:['sum','avg','last']}
function makeFields(id){const fields=definitions[id].map(([id,label,type,unit,aggregate,kpi],i)=>({id,label,type,unit,aggregate,kpi:!!kpi,primary:i===0,enabled:true}));legacy.forEach(([id,label,type,unit,aggregate])=>{if(!fields.some(f=>f.id===id))fields.push({id,label,type,unit,aggregate,kpi:false,primary:false,enabled:false})});fields.push({id:'note',label:'运营备注',type:'text',unit:'',aggregate:'none',enabled:true,kpi:false,primary:false});return fields}
const legacyKey='activity_data_dashboard_v1';
function legacyData(){const raw=localStorage.getItem(legacyKey);if(!raw)return {version:1,activities:[],todos:[],branding:{logo:null}};const data=JSON.parse(raw);if(!Array.isArray(data.activities))throw Error('小程序原始活动数据格式异常，请从备份恢复');return data}
function read(id){if(cache.has(id))return cache.get(id);const raw=localStorage.getItem(key(id));if(!raw)throw Error('V11 数据初始化尚未完成，请重新运行 V11 安装程序');const data=JSON.parse(raw);if(data.version!==11||!Array.isArray(data.fields)||!data.daily)throw Error('平台数据格式异常：'+id);if(id==='mini')data.activities=clone(legacyData().activities);prepareTypes(data);cache.set(id,data);return data}
function save(id,data){const next={...data,updatedAt:new Date().toISOString()},stored=clone(next);if(id==='mini'){const old=legacyData();if(JSON.stringify(old.activities)!==JSON.stringify(next.activities)){old.activities=next.activities;old.updatedAt=next.updatedAt;localStorage.setItem(legacyKey,JSON.stringify(old))}delete stored.activities}localStorage.setItem(key(id),JSON.stringify(stored));cache.set(id,next);return next}
function invalidate(id){cache.delete(id)}
function fields(id){return read(id).fields.filter(f=>f.enabled)}
function primary(id){return fields(id).find(f=>f.primary)||fields(id).find(f=>f.type!=='text')}
function records(id,activity){const s=read(id);const source=activity||(id==='mini'?s.dailySourceActivityId:null);return source?s.activities.find(a=>a.id===source)?.data||{}:s.daily}
function parse(value,f){if(value===null||value===undefined||String(value).trim()==='')return null;if(f.type==='text'){if(String(value).length>500)throw Error(f.label+'最多输入 500 字');return String(value)}
 const str=String(value).trim().replace(/[,，¥￥]/g,'').replace(/%$/,'');if(!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(str))throw Error(f.label+'请输入有效数字');const n=Number(str);if(!Number.isFinite(n))throw Error(f.label+'请输入有效数字');
 if(f.type==='count'&&(!Number.isSafeInteger(n)||n<0))throw Error(f.label+'应为非负整数');if(f.type==='percent'&&(n<0||n>100))throw Error(f.label+'应在 0–100 之间');if(Math.abs(n)>1e12)throw Error(f.label+'数值过大');return n;
}
function summary(data,ds,f){const rows=ds.map(date=>({date,value:data[date]?.[f.id]})).filter(r=>r.value!==''&&r.value!=null);if(f.type==='text')return {value:null,days:rows.length,last:rows.at(-1)?.date};const nums=rows.map(r=>({...r,value:Number(r.value)})).filter(r=>Number.isFinite(r.value));let value=0;if(nums.length){const sum=nums.reduce((s,r)=>s+r.value,0);value=f.aggregate==='sum'?sum:f.aggregate==='avg'?sum/nums.length:nums.at(-1).value}return {value,days:nums.length,last:nums.at(-1)?.date}}
function format(value,f,compact=false){if(value==null)return '—';if(f.type==='text')return String(value);const n=Number(value),dec=f.type==='money'?2:(f.type==='count'&&f.aggregate!=='avg'?0:2);if(compact&&Math.abs(n)>=10000)return(n/10000).toFixed(2)+'万'+(f.type==='money'?'元':f.type==='percent'?'%':'');return(f.type==='money'?'¥':'')+n.toLocaleString('zh-CN',{maximumFractionDigits:dec,minimumFractionDigits:f.type==='money'?2:0})+(f.type==='percent'?'%':'')}
function validateFields(id,list){if(list.length>40)throw Error('每个平台最多保留 40 个字段');const enabled=list.filter(f=>f.enabled),ids=new Set(),labels=new Set();if(!enabled.some(f=>f.type!=='text'))throw Error('请保留至少一个启用的数值指标');
 for(const f of list){if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.id)||['__proto__','constructor','prototype'].includes(f.id)||ids.has(f.id))throw Error('字段标识无效或重复');ids.add(f.id);if(!f.label.trim()||f.label.length>24)throw Error('字段名称需为 1–24 个字');if(labels.has(f.label.trim()))throw Error('字段名称不能重复：'+f.label);labels.add(f.label.trim());if(f.label==='日期')throw Error('“日期”为固定字段，请使用其他名称');if(f.unit.length>8)throw Error('单位最多 8 个字');if(!types[f.type]||!options(f.type).includes(f.aggregate))throw Error(f.label+'的类型与汇总方式不匹配');if(f.type==='text'&&(f.kpi||f.primary))throw Error('文本字段不能设为主指标或看板卡片');}
 const current=read(id);for(const f of list){const old=current.fields.find(v=>v.id===f.id);if(old&&old.type!==f.type){for(const data of [current.daily,records(id),...current.activities.map(a=>a.data)])for(const row of Object.values(data||{})){try{parse(row[f.id],f)}catch(e){throw Error('“'+f.label+'”已有数据不符合新类型；请保留原类型或新建字段。')}}}}
 return list.map(f=>({...f,label:f.label.trim(),unit:f.unit.trim()}));
}
function writeCells(id,activity,updates){const s=clone(read(id)),source=activity||(id==='mini'?s.dailySourceActivityId:null),data=source?s.activities.find(a=>a.id===source)?.data:s.daily;if(!data)throw Error('未找到所选活动');for(const {date,field,value} of updates){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||D.iso(D.dt(date))!==date)throw Error('日期无效');const f=scopeFields(id,activity).find(f=>f.id===field);if(!f)throw Error('字段已停用或不存在');const v=parse(value,f);data[date]||={};if(v===null)delete data[date][field];else data[date][field]=v}save(id,s)}
const typeNames={performance:'业绩活动',conversion:'转化率活动'};
const couponDefaults=[['couponReceived','券领取数量','count','张'],['couponRedeemed','券核销数量','count','张'],['couponAmount','券消费金额','money','元'],['participants','参与人数','count','人次']];
function prepareTypes(data){
 const before=data.fields.slice();
 if(!data.activityTypeVersion){
  for(const [id,label,type,unit] of couponDefaults)if(!data.fields.some(f=>f.id===id))data.fields.push({id,label,type,unit,aggregate:'sum',enabled:true,kpi:false,primary:false});
  data.activityTypeVersion=1;
 }
 data.activityTypes||={};
 for(const [id,name] of Object.entries(typeNames)){
  if(!data.activityTypes[id]){
   const ids=id==='conversion'?['couponReceived','couponRedeemed','couponAmount','participants','note']:data.platform==='mini'?['sales','revenue','received','note']:before.filter(f=>f.enabled&&!['couponReceived','couponAmount','participants'].includes(f.id)).map(f=>f.id);
   const fs=data.fields.filter(f=>ids.includes(f.id)&&f.enabled),nums=fs.filter(f=>f.type!=='text'),metrics=id==='conversion'?nums.slice(0,4):nums.filter(f=>f.kpi).slice(0,4);
   if(!metrics.length&&nums.length)metrics.push(nums[0]);
   const primary=id==='conversion'?nums.find(f=>f.id==='couponRedeemed'):nums.find(f=>f.primary);
   data.activityTypes[id]={id,name,fieldIds:fs.map(f=>f.id),metricIds:metrics.map(f=>f.id),primaryFieldId:(primary||metrics[0]||nums[0])?.id};
  }
 }
 data.dailyType||='performance';
 return data;
}
function activityType(id,activity){const s=read(id),a=s.activities.find(a=>a.id===(activity||(id==='mini'?s.dailySourceActivityId:null)));return typeNames[a?.activityTypeId]?a.activityTypeId:typeNames[a?.mode]?a.mode:a?'performance':(typeNames[s.dailyType]?s.dailyType:'performance')}
function typeConfig(id,typeId){const s=read(id),config=s.activityTypes[typeId]||s.activityTypes.performance;return config}
function scopeFields(id,activity,typeId){const config=typeConfig(id,typeId||activityType(id,activity));return fields(id).filter(f=>config.fieldIds.includes(f.id))}
function scopeMetrics(id,activity,typeId){const config=typeConfig(id,typeId||activityType(id,activity));return scopeFields(id,activity,typeId).filter(f=>f.type!=='text'&&config.metricIds.includes(f.id)).map(f=>({...f,primary:config.primaryFieldId===f.id}))}
function scopePrimary(id,activity,typeId){const config=typeConfig(id,typeId||activityType(id,activity)),fs=scopeFields(id,activity,typeId);return fs.find(f=>f.id===config.primaryFieldId&&f.type!=='text')||fs.find(f=>f.type!=='text')}
function typeActivities(id,typeId){const s=read(id);return s.activities.filter(a=>activityType(id,a.id)===typeId&&a.id!==s.dailySourceActivityId)}
function typeRecords(id,typeId){const out={},fs=scopeFields(id,null,typeId).filter(f=>f.type!=='text'&&f.aggregate==='sum');for(const a of typeActivities(id,typeId))for(const [date,row] of Object.entries(a.data||{}))for(const f of fs){const raw=row[f.id];if(raw==null||raw===''||!Number.isFinite(Number(raw)))continue;out[date]||={};out[date][f.id]=(out[date][f.id]||0)+Number(raw)}return out}
function validateActivityTypes(id,list,fieldList=fields(id)){
 const result=clone(list);for(const type of Object.keys(typeNames)){
  const c=result[type];if(!c)throw Error('缺少'+typeNames[type]+'配置');
  c.fieldIds=[...new Set(c.fieldIds)].filter(key=>fieldList.some(f=>f.enabled&&f.id===key));
  c.metricIds=[...new Set(c.metricIds)].filter(key=>c.fieldIds.includes(key)&&fieldList.some(f=>f.id===key&&f.type!=='text'));
  if(c.metricIds.length<1||c.metricIds.length>4)throw Error(typeNames[type]+'请选择 1–4 个指标卡');
  if(!c.metricIds.includes(c.primaryFieldId))throw Error(typeNames[type]+'的主指标须同时勾选录入字段和指标卡');
 }return result;
}
function reconcileTypes(id,next){for(const c of Object.values(next.activityTypes)){const valid=next.fields.filter(f=>f.enabled),nums=valid.filter(f=>f.type!=='text');c.fieldIds=c.fieldIds.filter(key=>valid.some(f=>f.id===key));c.metricIds=c.metricIds.filter(key=>c.fieldIds.includes(key)&&nums.some(f=>f.id===key));if(!c.metricIds.length){const candidate=nums.find(f=>c.fieldIds.includes(f.id));if(!candidate)throw Error(typeNames[c.id]+'至少需要保留一个数值字段，请先调整活动类型配置');c.metricIds=[candidate.id]}if(!c.metricIds.includes(c.primaryFieldId))c.primaryFieldId=c.metricIds[0]}validateActivityTypes(id,next.activityTypes,next.fields);return next}

root.PlatformModel={typeNames,activityType,typeConfig,scopeFields,scopeMetrics,scopePrimary,typeActivities,typeRecords,validateActivityTypes,reconcileTypes,types,aggregates,key,uid,clone,options,makeFields,read,save,invalidate,fields,primary,records,parse,summary,format,validateFields,writeCells};
if(typeof module!=='undefined')module.exports=root.PlatformModel;
})(typeof window!=='undefined'?window:globalThis);
