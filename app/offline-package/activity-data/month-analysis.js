/* Performance comparisons include positive-sales dates only; source records remain intact. */
(function (root) {
  'use strict';
  const metrics = {
    performance: ['sales', 'revenue', 'received'],
    conversion: ['couponReceived', 'couponRedeemed', 'couponAmount', 'participants']
  };
  const labels = {sales:'销量',revenue:'营业额',received:'实收',couponReceived:'领券',couponRedeemed:'核销',couponAmount:'券消费金额',participants:'参与人数'};
  function hasValue(v) { return (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(Number(v)); }
  function days(month) { const [y,m]=month.split('-').map(Number); return new Date(y,m,0).getDate(); }
  function previous(month) { const [y,m]=month.split('-').map(Number); return m===1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`; }
  function validDate(date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false; const [y,m,d]=date.split('-').map(Number); return m>=1&&m<=12&&d>=1&&d<=days(date.slice(0,7)); }
  function rows(activity,month,end=days(month)) {
    return Object.entries(activity.data||{}).filter(([date])=>validDate(date)&&date.slice(0,7)===month&&Number(date.slice(8))<=end).sort(([a],[b])=>a.localeCompare(b));
  }
  function hasMetrics(activity,row) { return metrics[activity.mode].some(k=>hasValue(row?.[k])); }
  function cutoff(activities,month) {
    return activities.reduce((end,a)=>rows(a,month).reduce((n,[d,r])=>hasMetrics(a,r)?Math.max(n,Number(d.slice(8))):n,end),0);
  }
  function range(activities,month,mode='same') {
    const end=cutoff(activities,month), prev=previous(month);
    return {month,previous:prev,end,prevEnd:mode==='full'?days(prev):Math.min(end,days(prev)),mode};
  }
  function eligible(activity,row) {
    return activity.mode !== 'performance' || hasValue(row?.sales) && Number(row.sales) > 0;
  }
  function stats(activity,month,end,key) {
    const periodRows=rows(activity,month,end);
    const recorded=periodRows.filter(([,r])=>hasValue(r?.[key]));
    const entered=recorded.filter(([,r])=>eligible(activity,r));
    const total=entered.reduce((s,[,r])=>s+Number(r[key]),0);
    const rawTotal=recorded.reduce((s,[,r])=>s+Number(r[key]),0);
    const excludedZeroDays=activity.mode==='performance' ? periodRows.filter(([,r])=>hasValue(r?.sales)&&Number(r.sales)===0).length : 0;
    return {total,rawTotal,recordedDays:recorded.length,days:entered.length,excludedZeroDays,
      missingDays:Math.max(0,end-entered.length-excludedZeroDays),
      average:entered.length?total/entered.length:null,last:entered.length?entered[entered.length-1][0]:null};
  }

  function change(current,prev) { return current===null||prev===null||prev===0?null:(current/prev-1)*100; }
  function compare(activity,r) {
    const values={};
    for(const key of metrics[activity.mode]) {
      const current=stats(activity,r.month,r.end,key), prev=stats(activity,r.previous,r.prevEnd,key);
      values[key]={current,previous:prev,delta:change(current.average,prev.average),status:current.average===null?(activity.mode==='performance'?'本月无有效数据':'本月无数据'):prev.average===null?(activity.mode==='performance'?'上月无有效数据':'上月无数据'):prev.average===0?'上月为0':'可比',partial:current.missingDays>0||prev.missingDays>0};
    }
    const key=activity.mode==='performance'?'received':'couponAmount';
    return {activity,range:r,metrics:values,key,primary:values[key]};
  }
  function matchedRatio(activity,month,end,numerator,denominator) {
    const sample=rows(activity,month,end).filter(([,r])=>eligible(activity,r)&&hasValue(r[numerator])&&hasValue(r[denominator]));
    const num=sample.reduce((s,[,r])=>s+Number(r[numerator]),0), den=sample.reduce((s,[,r])=>s+Number(r[denominator]),0);
    return {value:den>0?num/den:null,days:sample.length};
  }
  function pct(v) { return `${v>0?'+':''}${v.toFixed(1)}%`; }
  function insights(report) {
    const {activity,range:r,metrics:m}=report, found=[];
    for(const key of metrics[activity.mode]) {
      const item=m[key];
      if(item.delta!==null && item.delta<0) found.push({title:`${labels[key]}日均下降 ${Math.abs(item.delta).toFixed(1)}%`,text:`本月有效 ${item.current.days} 天，上月有效 ${item.previous.days} 天。${activity.mode==='performance'?`已分别剔除零销量 ${item.current.excludedZeroDays} 天、${item.previous.excludedZeroDays} 天。`:''}${item.partial?'数据未覆盖完整比较区间，请先核对缺录或实际活动天数。':'有效日期的指标均已录入。'}`});
    }
    if(!found.length) found.push({title:report.primary.delta===null?'暂不能判断主指标环比':'当前可比指标未见日均下降',text:report.primary.delta===null?`${report.primary.status}；补齐可比数据后再观察。`:'继续观察趋势，并核对活动规则、投放与门店执行的变化。'});
    if(activity.mode==='performance') {
      const cur=matchedRatio(activity,r.month,r.end,'received','sales'),prev=matchedRatio(activity,r.previous,r.prevEnd,'received','sales');
      const delta=change(cur.value,prev.value);
      found.push({title:'销量与份均实收',text:`按销量大于 0 且实收已录入的日期计算。${cur.value===null?'本月暂无可计算数据。':`本月份均实收 ¥${cur.value.toFixed(2)}（${cur.days} 天）`}${delta===null?(cur.value===null?'':'；上月暂无有效比较基数。'):`，上月 ¥${prev.value.toFixed(2)}（${prev.days} 天），环比 ${pct(delta)}。`} 份均实收不是订单客单价；可结合套餐价格、优惠或产品结构变化核查。`});
    } else {
      const cur=matchedRatio(activity,r.month,r.end,'couponRedeemed','couponReceived');
      found.push({title:'领券 → 核销 → 券消费',text:`分别观察领券日均、核销日均和券消费金额日均。${cur.value===null?'暂无可计算的期间核销/领券比。':`本期核销/领券比 ${(cur.value*100).toFixed(1)}%（两个指标都有数据的 ${cur.days} 天）。`} 核销可能来自上月领券，此比值不等于同批次券转化率。`});
    }
    return found;
  }
  root.ActivityMonthAnalysis={metrics,labels,hasValue,days,previous,validDate,rows,cutoff,range,eligible,stats,change,compare,matchedRatio,insights};
  if(typeof module!=='undefined'&&module.exports) module.exports=root.ActivityMonthAnalysis;
})(typeof window!=='undefined'?window:globalThis);
