(()=>{
'use strict';
const D=window.Demo,$=s=>document.querySelector(s),state={period:'month',date:D.cutoff,route:'overview',platform:'mini',mode:'all'};
const money=n=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2,minimumFractionDigits:2}).format(n);
const count=n=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0}).format(n);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mark=p=>`<span class="platform-mark" aria-hidden="true" style="color:${p.color};background:${p.soft}">${p.mark}</span>`;
const route=p=>`#/platform/${p.id}`;
function pct(a,b,hasCurrent=true,hasPrevious=true){
  if(!hasCurrent)return '<span class="delta neutral">暂无本期</span>';
  if(!hasPrevious||b==null)return '<span class="delta neutral">暂无同期</span>';
  if(b===0&&a>0)return '<span class="delta neutral">无比较基数</span>';
  const v=D.delta(a,b);if(v==null)return '<span class="delta neutral">—</span>';
  return `<span class="delta ${v<0?'negative':v===0?'neutral':''}">${v>0?'↗':v<0?'↘':'—'} ${v>0?'+':''}${v.toFixed(1)}%</span>`;
}
DateFilter.init(state);
function range(){return DateFilter.range(state)}
function nice(s){return s?s.replaceAll('-','.'):''}
function rangeText(start,end){return start===end?nice(start):`${nice(start)} — ${nice(end)}`}
function chart(r,key,color){
  const cur=r.days.map(d=>D.transaction(d)?.[key]??null),prev=r.prevDays.map(d=>D.transaction(d)?.[key]??null),all=[...cur,...prev].filter(v=>v!=null),max=Math.max(1,...all)*1.15;
  const w=440,h=125,L=39,R=13,T=8,B=25,plot=w-L-R,height=h-T-B,n=Math.max(cur.length,prev.length,1);
  const x=i=>L+(n===1?plot/2:i*plot/(n-1)),y=v=>T+height-v/max*height;
  let s=`<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${key==='received'?'小程序支付实收':'会员储值金额'}本期与${escape(r.compareLabel)}每日趋势">`;
  [0,.5,1].forEach(v=>{const yy=T+height*(1-v);s+=`<line x1="${L}" y1="${yy}" x2="${w-R}" y2="${yy}" stroke="#e9eef5" stroke-dasharray="3 4"/><text x="${L-8}" y="${yy+3}" text-anchor="end">${v===0?'0':max*v>=10000?(max*v/10000).toFixed(1)+'万':count(max*v)}</text>`});
  const path=arr=>{let connected=false;return arr.map((v,i)=>{if(v==null){connected=false;return ''}const c=connected?'L':'M';connected=true;return `${c}${x(i).toFixed(2)} ${y(v).toFixed(2)}`}).join(' ')};
  if(cur.length>1&&cur.every(v=>v!=null)){s+=`<path d="${path(cur)} L${x(cur.length-1)} ${T+height} L${L} ${T+height} Z" fill="${color}" opacity=".055"/>`}
  s+=`<path d="${path(prev)}" fill="none" stroke="#b4c5db" stroke-width="2" stroke-dasharray="5 4"/><path d="${path(cur)}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>`;
  cur.forEach((v,i)=>{if(v==null)return;s+=`<circle class="hit" cx="${x(i)}" cy="${y(v)}" r="${n===1?5:3}" style="fill:${color}"><title>${r.days[i]}：¥${money(v)}${prev[i]!=null?'；'+r.compareLabel+' '+r.prevDays[i]+' ¥'+money(prev[i]):'；暂无同期'}</title></circle>`});
  prev.forEach((v,i)=>{if(v!=null)s+=`<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="#b4c5db"><title>${escape(r.compareLabel)} ${r.prevDays[i]}：¥${money(v)}</title></circle>`});
  [...new Set([0,Math.floor((n-1)/2),n-1])].forEach(i=>{s+=`<text x="${x(i)}" y="${h-5}" text-anchor="middle">${r.unequalDays?'第'+(i+1)+'天':r.days[i]?.slice(5).replace('-','/')||''}</text>`});
  return s+'</svg>';
}
function mainCard(member,r){const id=member?'member':'mini',cur=D.summary(r.days),prev=D.summary(r.prevDays),key=member?'recharge':'received',ticket=CoreModel.averageTicket(id,r.days),ticketMetric=CoreModel.ticketField(id);const metrics=member?[[cur.memberAmount==null?'—':'¥'+money(cur.memberAmount),'会员消费金额',cur.memberAmount==null?'未导入':'元'],[cur.memberCount==null?'—':count(cur.memberCount),'消费会员人次',cur.memberCount==null?'未导入':'人次'],[cur.newMembers==null?'—':count(cur.newMembers),'新增会员',cur.newMembers==null?'未导入':'人']]:[[cur.sales==null?'—':count(cur.sales),ticket.sourceConfirmed?'有效订单数':'销量',ticket.sourceConfirmed?'单':'份'],[cur.revenue==null?'—':'¥'+money(cur.revenue),'营业额','元'],[count(cur.receivedDays),'实收已录入','天']];metrics.push([ticket.value==null?'—':'¥'+money(ticket.value),ticketMetric.label,'元/单']);return `<article class="panel main-panel ${member?'member':''}"><div class="panel-heading"><div class="panel-title"><span class="panel-icon">${member?'♧':'▤'}</span><div><h2>${escape(CoreModel.title(id))}</h2><p>${member?'MEMBER PERFORMANCE':'MINI PROGRAM PERFORMANCE'}</p></div></div><a href="#/${id}-performance">查看明细 ↗</a></div>${ImportCenter.coreActions(id)}<div class="bigmetric"><div><div class="metricname">${member?'会员储值实收':'实收'}</div><div class="amount"><span class="currency">¥</span>${cur[key]==null?'—':money(cur[key])}</div></div><div class="compare-value">${pct(cur[key],prev[key],cur[key+'Days'],prev[key+'Days'])}<small>较${escape(r.compareLabel)}累计</small></div></div><div class="core-period-comparison"><span>本期 ${rangeText(r.start,r.end)}</span>${PlatformUI.comparison({value:cur[key],days:cur[key+'Days']},{value:prev[key],days:prev[key+'Days']},{type:'money',unit:'元'},r)}</div><dl class="kpi-row core-kpi-row">${metrics.map(([value,label,unit])=>`<div><dt>${label}</dt><dd>${value}<small>${unit}</small></dd></div>`).join('')}</dl><p class="core-average-note" data-average-ticket="${id}">${escape(ticket.note)}</p><div class="chart-title"><span>每日${member?'会员储值':'实收'}趋势</span><div class="legend"><span><i></i>本期</span><span title="${escape(rangeText(r.prevStart,r.prevEnd))}"><i class="prev"></i>${escape(r.compareLabel)}</span></div></div>${chart(r,key,member?'#36a5ad':'#287bdd')}<div class="panel-note">${escape(CoreModel.source(id,r.days))}。${member?'消费会员人次按每日人数相加，未做期间去重；储值单列。':'已导入字段优先展示，缺项沿用关联记录。'}</div></article>`}

function portalsCompact(){return `<div class="portals-row">${D.platforms.map(p=>`<a class="portal" href="${route(p)}">${mark(p)}<span><strong>${p.name}</strong><small>${p.id==='mini'?'数据与活动管理':'平台数据与活动'}</small></span><span class="portal-arrow">↗</span></a>`).join('')}</div>`}
function platformTable(r){return PlatformUI.overviewTable(r)}
function operationsEntry(){return `<section class="operations-entry" aria-labelledby="operations-screen-title"><div class="operations-graphic" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M5 30V10m0 20h30M12 26v-8m8 8V11m8 15v-5"/><path d="m11 11 8-6 9 8 7-5"/></svg></div><div class="operations-copy"><div class="operations-eyebrow">CHAIN OPERATIONS</div><h2 id="operations-screen-title">连锁经营大屏</h2><p>门店营收 · 3D省市下钻 · 会员与储值</p><div class="operations-meta"><span>通用经营分析</span><span>空数据模板 · 可接入自己的数据</span></div></div><a class="operations-open" href="../operations/" target="_blank" rel="noopener" data-testid="open-operations-screen">打开经营大屏 <span aria-hidden="true">↗</span></a></section>`}
function overview(r){return `${operationsEntry()}<div class="section-label"><h2><span>01</span>核心业绩</h2><p>交易与会员，两条主线同步观察</p></div><div class="primary-grid">${mainCard(false,r)}${mainCard(true,r)}</div><div class="section-label"><h2><span>02</span>多平台统一入口</h2><a class="text-button" href="#/portals">进入工作台 →</a></div>${portalsCompact()}<div class="section-label"><h2><span>03</span>子平台活动与指标效果</h2><button class="text-button" data-action="export-platforms">导出当前对比 ↓</button></div>${platformTable(r)}`}
function portals(r){return PlatformUI.portals(r)}
function report(member,r){const id=member?'member':'mini',fs=CoreModel.reportFields(id),nums=fs.filter(f=>f.type!=='text'),c=CoreModel.reportSummary(id,r.days),b=CoreModel.reportSummary(id,r.prevDays),val=(v,f)=>v==null||v===''?'—':PlatformModel.format(v,f);return `<div class="primary-grid">${mainCard(member,r)}<section class="panel" style="padding:24px"><div class="eyebrow">PERIOD COMPARISON</div><h2>${escape(CoreModel.title(id))} · 同期对照</h2><div class="table-scroll"><table><thead><tr><th>指标</th><th>本期<span class="comparison-dates">${escape(rangeText(r.start,r.end))}</span></th><th>${escape(r.compareLabel)}<span class="comparison-dates">${escape(rangeText(r.prevStart,r.prevEnd))}</span></th></tr></thead><tbody>${nums.map(f=>`<tr><td>${f.label}</td><td>${val(c[f.id],f)}${f.derived?'<small class="comparison-dates">'+escape(CoreModel.averageTicket(id,r.days).coverage)+'</small>':''}</td><td>${val(b[f.id],f)}${f.derived?'<small class="comparison-dates">'+escape(CoreModel.averageTicket(id,r.prevDays).coverage)+'</small>':''}</td></tr>`).join('')}</tbody></table></div><p class="panel-note">导入数据保存于当前核心模块；缺项沿用关联活动。<a href="#/settings/mini">调整关联来源 →</a></p><p class="panel-note">${member?'消费会员人次是每日人数合计，不代表期间去重人数。储值与消费金额分别统计。':'销量沿用原字段口径。导入 0 会显示实际零值，空白字段保留原记录。'}</p></section></div><div class="section-label"><h2>${escape(CoreModel.title(id))} · 每日明细</h2><button class="text-button" data-action="export-daily">导出明细 ↓</button></div><section class="panel"><div class="table-scroll"><table><thead><tr><th>日期</th>${fs.map(f=>'<th>'+f.label+'</th>').join('')}</tr></thead><tbody>${r.days.slice().reverse().map(date=>{const row=CoreModel.reportRow(id,date);return `<tr><td>${date}</td>${fs.map(f=>'<td>'+escape(val(row[f.id],f))+'</td>').join('')}</tr>`}).join('')}</tbody></table></div></section>`}

function render(){
 const r=range(),p=D.platforms.find(p=>p.id===state.platform);const titles={'store-rank':['门店排行','新导入的门店明细，小程序实收与储值实收分别排名。','STORE PERFORMANCE RANKING'],plans:['活动计划','按月安排小程序活动与阶段，选择已有活动查看效果。','ACTIVITY PLANNING'],overview:['多平台效果总览','从交易到会员，再到每一次活动。','OPERATIONS OVERVIEW'],portals:['多平台工作台','五个平台，一处进入。','PLATFORM WORKSPACE'],'mini-performance':[CoreModel.title('mini'),'支持独立导入，未填写的字段沿用关联活动数据。','MINI PROGRAM PERFORMANCE'],'member-performance':[CoreModel.title('member'),'导入每日储值、会员消费与新增会员数据。','MEMBER PERFORMANCE'],platform:[p.name+'数据详情',p.desc+' · 独立指标，统一观察。','PLATFORM OVERVIEW'],daily:[p.name+'数据详情','按平台指标记录每日表现，活动数据分别管理。','DAILY PLATFORM DATA'],activities:[p.name+'数据详情','聚焦每个活动的执行与成效。','PLATFORM ACTIVITIES'],settings:['平台字段设置','为不同平台配置适合自己的数据指标。','PLATFORM FIELD SETTINGS']};
 const title=titles[state.route]||titles.overview;
 for(const id of ['mini','member']){const link=document.querySelector('[data-nav="'+id+'-performance"]');link.innerHTML='<span class="navicon" aria-hidden="true">'+(id==='mini'?'▤':'♧')+'</span>'+escape(CoreModel.title(id))}
 $('#pageTitle').textContent=title[0];$('#pageDescription').textContent=title[1];$('#eyebrow').textContent=title[2];$('#crumbTitle').textContent=title[0];document.title=title[0]+' · 会员运营中台';
 DateFilter.sync(state,r);
 $('#rangeLabel').textContent=rangeText(r.start,r.end);
 $('#comparisonLabel').textContent=`本期 ${rangeText(r.start,r.end)}（${r.days.length}天）　对比 ${r.prevStart?rangeText(r.prevStart,r.prevEnd)+'（'+r.prevDays.length+'天）':'上月无对应日期'}`;
 document.querySelectorAll('[data-period]').forEach(b=>{b.classList.toggle('active',b.dataset.period===state.period);b.setAttribute('aria-pressed',String(b.dataset.period===state.period))});
 document.body.classList.toggle('is-plans',state.route==='plans');document.body.classList.remove('is-workspace');document.body.classList.toggle('is-settings',state.route==='settings');
 document.querySelectorAll('[data-nav]').forEach(el=>{const active=el.dataset.nav===(['platform','daily','activities'].includes(state.route)?state.platform:state.route);el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
 if(state.route==='plans'&&$('#view activity-plan-board')){$('#view activity-plan-board').onHostUpdate?.([]);return}
 $('#view').innerHTML=state.route==='store-rank'?StoreRankUI.render(r):state.route==='plans'?'<activity-plan-board></activity-plan-board>':state.route==='overview'?overview(r):state.route==='portals'?portals(r):state.route==='platform'?PlatformUI.home(state.platform,r)+ImportCenter.panel(state.platform):state.route==='daily'?PlatformUI.daily(state.platform,r,state.activity):state.route==='activities'?PlatformUI.activities(state.platform,r)+ImportCenter.panel(state.platform):state.route==='settings'?PlatformUI.settings(state.platform):report(state.route==='member-performance',r);
 PlatformUI.afterRender();
 ActivityCalendar.mount(document);
}
function navigate(){const parts=location.hash.replace(/^#\/?/,'').split('/');if(state.route==='plans'&&parts[0]!=='plans'){const board=$('activity-plan-board');if(board&&!board.canLeave()){location.hash='#/plans';return}}state.route=['store-rank','plans','overview','portals','mini-performance','member-performance','platform','daily','activities','settings'].includes(parts[0])?parts[0]:parts[0]==='workspace'?'daily':'overview';state.platform=D.platforms.some(p=>p.id===parts[1])?parts[1]:'mini';try{state.activity=parts[2]?decodeURIComponent(parts[2]):null}catch(e){state.activity=null}state.mode='all';state.trend=null;$('#sidebar').classList.remove('open');$('#menuButton').setAttribute('aria-expanded','false');render();window.scrollTo(0,0)}
function csvCell(v){const s=String(v??'');return '"'+s.replaceAll('"','""')+'"'}
function download(name,rows){const blob=new Blob(['\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('已导出当前筛选范围的 CSV 表格')}
function exportPlatforms(){PlatformUI.csv(range())}
function exportDaily(){const r=range(),id=state.route==='member-performance'?'member':'mini',fs=CoreModel.reportFields(id),rows=[['模块标识','模块名称','日期',...fs.map(f=>f.label)]];r.days.forEach(date=>{const row=CoreModel.reportRow(id,date);rows.push([id,CoreModel.title(id),date,...fs.map(f=>f.derived&&row[f.id]!=null?row[f.id].toFixed(2):row[f.id])])});download(ImportCenter.filename(CoreModel.title(id))+'_每日明细_'+r.start+'_'+r.end+'.csv',rows)}

let toastTimer;function toast(s){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3200)}
$('#platformNav').innerHTML=D.platforms.map(p=>`<a class="navlink" data-nav="${p.id}" href="${route(p)}"><span class="platform-dot" aria-hidden="true" style="background:${p.soft};color:${p.color}">${p.mark}</span>${p.name}</a>`).join('');
DateFilter.bind({state,render});
ActivityCalendar.mount(document);
new MutationObserver(()=>ActivityCalendar.mount(document)).observe(document.body,{childList:true,subtree:true});
$('#rulesButton').addEventListener('click',()=>$('#rulesDialog').showModal());
$('#closeRules').addEventListener('click',()=>$('#rulesDialog').close());$('#understood').addEventListener('click',()=>$('#rulesDialog').close());
$('#rulesDialog').addEventListener('click',e=>{if(e.target===$('#rulesDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
$('#menuButton').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('open');$('#menuButton').setAttribute('aria-expanded',String(open))});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#sidebar').classList.remove('open');$('#menuButton').setAttribute('aria-expanded','false')}});
$('#view').addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='export-platforms')exportPlatforms();if(action==='export-daily')exportDaily()});
window.addEventListener('hashchange',navigate);
window.addEventListener('storage',e=>{if(e.key===CoreModel.key){CoreModel.invalidate();render();return}const p=D.platforms.find(p=>PlatformModel.key(p.id)===e.key);if(p){PlatformModel.invalidate(p.id);if(state.route!=='settings')render()}});
PlatformUI.bind({state,render,toast,range});
ImportCenter.bind({state,render,toast,range});
StoreRankUI.bind({state,render,toast,range});
D.platforms.forEach(p=>PlatformModel.read(p.id));
window.__onSharedStorageUpdate=keys=>{if(keys.includes(CoreModel.key))CoreModel.invalidate();D.platforms.forEach(p=>{if(keys.includes(PlatformModel.key(p.id))||(p.id==='mini'&&keys.includes('activity_data_dashboard_v1'))){PlatformModel.invalidate(p.id);PlatformUI.invalidate(p.id)}});if(state.route==='plans'){$('activity-plan-board')?.onHostUpdate?.(keys);return}render()};
navigate();
})();
