(function(root){
  'use strict';
  const cache=new Map(),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0'),iso=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
  function valid(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'2000-01-01'||value>'2100-12-31')return false;const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,12);return date.getFullYear()===y&&date.getMonth()+1===m&&date.getDate()===d;}
  function info(value){
    if(!valid(value))return {iso:value,lunar:'',festivals:[],term:'',label:'',title:String(value??'')};
    if(cache.has(value))return cache.get(value);
    const solar=root.Solar.fromYmd(...value.split('-').map(Number)),lunar=solar.getLunar();
    const festivals=[...new Set([...solar.getFestivals(),...lunar.getFestivals(),...solar.getOtherFestivals(),...lunar.getOtherFestivals()])];
    const term=lunar.getJieQi(),text=lunar.getMonthInChinese()+'月'+lunar.getDayInChinese();
    const label=festivals[0]||term||lunar.getDayInChinese();
    const result={iso:value,lunar:text,festivals,term,label,title:[value,'农历'+text,...festivals,term].filter(Boolean).join(' · ')};
    if(cache.size>12000)cache.clear();cache.set(value,result);return result;
  }
  function badge(value){const v=info(value);return `<small class="calendar-date-note ${v.festivals.length?'festival':v.term?'term':''}" title="${esc(v.title)}">${esc([...v.festivals,v.term].filter(Boolean).join(' · ')||v.lunar)}</small>`;}
  function open(options={}){
    const doc=root.document,min=valid(options.min)?options.min:'2000-01-01',max=valid(options.max)?options.max:'2100-12-31';
    let value=valid(options.value)?options.value:root.Demo?.cutoff||iso(new Date().getFullYear(),new Date().getMonth()+1,new Date().getDate());
    value=value<min?min:value>max?max:value;
    let month=value.slice(0,7),selected=value,active=value,closed=false;
    const host=options.container||doc.body,dialog=doc.createElement('dialog');dialog.className='activity-calendar';dialog.setAttribute('aria-label','万年历日期选择');
    if(host!==doc.body){const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL('./calendar.css',doc.querySelector('script[src*="calendar.js"]')?.src||doc.baseURI).href;dialog.append(link);}
    const body=doc.createElement('div');body.className='calendar-body';dialog.append(body);host.append(dialog);
    const close=()=>{if(closed)return;closed=true;dialog.close();dialog.remove();options.onClose?.();};
    const select=date=>{if(date<min||date>max)return;selected=date;options.onSelect?.(date);close();};
    const shift=n=>{const [y,m]=month.split('-').map(Number),date=new Date(y,m-1+n,1,12),next=iso(date.getFullYear(),date.getMonth()+1,1).slice(0,7);if(next<min.slice(0,7)||next>max.slice(0,7))return;month=next;render();};
    function render(){
      const [y,m]=month.split('-').map(Number),first=(new Date(y,m-1,1,12).getDay()+6)%7,days=new Date(y,m,0).getDate(),v=info(active);
      body.innerHTML=`<div class="calendar-head"><div><strong>万年历</strong><small>公历 · 农历 · 节日 · 节气</small></div><button type="button" data-calendar-close aria-label="关闭万年历">×</button></div><div class="calendar-controls"><button type="button" data-calendar-shift="-1" aria-label="日历上个月" ${month<=min.slice(0,7)?'disabled':''}>‹</button><input type="month" aria-label="日历月份" min="${min.slice(0,7)}" max="${max.slice(0,7)}" value="${month}"><button type="button" data-calendar-shift="1" aria-label="日历下个月" ${month>=max.slice(0,7)?'disabled':''}>›</button></div><div class="calendar-weekdays">${[...'一二三四五六日'].map(w=>'<span>'+w+'</span>').join('')}</div><div class="calendar-days" role="grid" aria-label="${y}年${m}月">${'<span class="calendar-blank"></span>'.repeat(first)}${Array.from({length:days},(_,i)=>{
        const date=iso(y,m,i+1),v=info(date),disabled=date<min||date>max;
        return `<button type="button" role="gridcell" data-calendar-date="${date}" aria-label="${esc(v.title)}" aria-selected="${date===selected}" ${disabled?'disabled':''} class="${date===selected?'selected ':''}${date===root.Demo?.cutoff?'today ':''}${v.festivals.length?'is-festival':v.term?'is-term':''}"><b>${i+1}</b><small>${esc(v.label)}</small>${v.festivals.length&&v.term?'<i class="calendar-term-dot"></i>':''}</button>`;
      }).join('')}</div><div class="calendar-details" aria-live="polite"><strong>${esc(v.iso)}</strong><span>农历${esc(v.lunar)}</span><p>${esc([...v.festivals,v.term].filter(Boolean).join(' · ')||'暂无节日或节气')}</p></div><div class="calendar-foot"><span>悬停查看详情，点击选择日期</span><button type="button" data-calendar-today>今天</button></div>`;
      body.querySelector('[data-calendar-close]').onclick=close;
      body.querySelectorAll('[data-calendar-shift]').forEach(b=>b.onclick=()=>shift(Number(b.dataset.calendarShift)));
      body.querySelector('input[type=month]').onchange=e=>{const next=e.target.value;if(/^\d{4}-\d{2}$/.test(next)&&next>=min.slice(0,7)&&next<=max.slice(0,7)){month=next;render();}};
      body.querySelector('[data-calendar-today]').onclick=()=>{const today=root.Demo?.cutoff;if(!today||today<min||today>max)return;active=today;month=today.slice(0,7);render();};
      body.querySelectorAll('[data-calendar-date]').forEach(button=>{
        const show=()=>{active=button.dataset.calendarDate;const v=info(active),detail=body.querySelector('.calendar-details');detail.innerHTML=`<strong>${esc(v.iso)}</strong><span>农历${esc(v.lunar)}</span><p>${esc([...v.festivals,v.term].filter(Boolean).join(' · ')||'暂无节日或节气')}</p>`;};
        button.onclick=()=>select(button.dataset.calendarDate);button.onmouseenter=show;button.onfocus=show;
      });
    }
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||!e.target.dataset.calendarDate)return;
      e.preventDefault();const date=new Date(e.target.dataset.calendarDate+'T12:00:00');date.setDate(date.getDate()+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key]));const next=iso(date.getFullYear(),date.getMonth()+1,date.getDate());if(next<min||next>max)return;active=next;month=next.slice(0,7);render();body.querySelector(`[data-calendar-date="${next}"]`)?.focus();
    });
    render();dialog.showModal();body.querySelector(`[data-calendar-date="${selected}"]`)?.focus({preventScroll:true});return {close,dialog};
  }
  function mount(host=root.document){
    host.querySelectorAll('input[type=date]').forEach(input=>{
      if(input.closest('.activity-calendar')||input.dataset.calendarBound)return;input.dataset.calendarBound='true';
      const button=root.document.createElement('button');button.type='button';button.className='calendar-trigger';button.textContent='▦';button.setAttribute('aria-label','万年历：'+(input.getAttribute('aria-label')||input.name||'选择日期'));
      input.insertAdjacentElement('afterend',button);button.onclick=()=>{
        const boundary=input.getRootNode(),container=boundary instanceof root.ShadowRoot?boundary:root.document.body;
        open({value:input.value,min:input.min,max:input.max,container,onSelect:value=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));input.dispatchEvent(new Event('change',{bubbles:true,composed:true}));input.focus({preventScroll:true});}});
      };
    });
  }
  root.ActivityCalendar={info,badge,open,mount,valid};
})(window);
