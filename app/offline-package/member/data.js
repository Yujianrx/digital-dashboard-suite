(function(root){'use strict';const now=new Date();const cutoff=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');const platforms=[{"id": "mini", "name": "小程序", "mark": "小", "color": "#1478db", "soft": "#e9f3ff", "desc": "交易与会员转化"}, {"id": "video", "name": "视频号", "mark": "视", "color": "#d57a12", "soft": "#fff3df", "desc": "短视频种草与到店"}, {"id": "red", "name": "小红书", "mark": "红", "color": "#df4660", "soft": "#fff0f3", "desc": "笔记种草与领券"}, {"id": "douyin", "name": "抖音视频", "mark": "抖", "color": "#333b50", "soft": "#eceff5", "desc": "内容引流与团购"}, {"id": "wechat", "name": "公众号", "mark": "公", "color": "#209266", "soft": "#e8f6ee", "desc": "内容触达与会员召回"}];
  const dt=s=>new Date(s+'T12:00:00');
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const add=(s,n)=>{const d=dt(s);d.setDate(d.getDate()+n);return iso(d)};
  function dates(start,end){const result=[];for(let s=start;s<=end;s=add(s,1))result.push(s);return result}
  function previous(s){const d=dt(s),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()-1);const max=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,max));return iso(d)}
  function periods(date,kind,asOf=cutoff){
    const d=dt(date);let start=date,end=date;
    if(kind==='week'){start=add(date,-((d.getDay()+6)%7));end=add(start,6)}
    if(kind==='month'){start=date.slice(0,7)+'-01';end=iso(new Date(d.getFullYear(),d.getMonth()+1,0))}
    end=end>asOf?asOf:end;
    if(start>end)return {start,end,prevStart:null,prevEnd:null,days:[],prevDays:[]};
    const current=dates(start,end);let prevStart=previous(start),prevEnd;
    if(kind==='day'&&prevStart.slice(8)!==start.slice(8))prevStart=null;
    if(prevStart){prevEnd=kind==='week'?add(prevStart,current.length-1):previous(end)}
    return {start,end,prevStart,prevEnd,days:current,prevDays:prevStart?dates(prevStart,prevEnd):[]};
  }

function transaction(date){const M=root.PlatformModel,s=M.read('mini'),mini=M.records('mini')[date]||{},member=s.activities.find(a=>a.id===s.rechargeSourceActivityId)?.data?.[date]||{};const value=v=>v==null||v===''?null:(Number.isFinite(Number(v))?Number(v):null);return {received:value(mini.received),revenue:value(mini.revenue),sales:value(mini.sales),recharge:value(member.received)}}
function summary(ds){const out={};for(const key of ['received','revenue','sales','recharge']){const rows=ds.map(d=>transaction(d)[key]).filter(v=>v!==null);out[key]=rows.length?rows.reduce((s,v)=>s+v,0):null;out[key+'Days']=rows.length}return out}
function delta(a,b){if(a==null||b==null)return null;if(b===0)return a===0?0:null;return (a-b)/Math.abs(b)*100}
root.Demo={cutoff,platforms,dt,iso,add,dates,previous,periods,transaction,summary,delta};
})(window);
