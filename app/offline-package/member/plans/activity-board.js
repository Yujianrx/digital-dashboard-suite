import styles from './styles.js';
import { ActivityRepository } from './repository.js';
import { uid, TYPES, localDate, monthBounds, shiftMonth, inMonth, dateStatus, currentStage, normalizeActivity, normalizeBackup } from './core.js';
const paths = {
 calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
 plus: '<path d="M12 5v14M5 12h14"/>', left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
 edit: '<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m13 6 5 5"/>',
 lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 close: '<path d="m6 6 12 12M18 6 6 18"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.calendar}</svg>`;
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const fmt = value => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
export class ActivityBoard extends HTMLElement {
  constructor() {
    super(); this.attachShadow({ mode: 'open' }); this.month = localDate().slice(0, 7);
    this.activities = []; this.revision = 0; this.loaded = false; this.lastSaved = ''; this.error = '';
    this.uid = `ab-${uid().slice(0,8)}`;
  }
  set repository(value) { this._repository = value; if (this.isConnected) this.load(); }
  get repository() { return this._repository ??= new ActivityRepository(this.getAttribute('api-base') ?? undefined); }
  connectedCallback() { this.render(); this.load(); }
  disconnectedCallback() { clearTimeout(this.noticeTimer); this.toolLifecycle?.abort(); this.removeBeforeUnload(); }
  async load() {
    try { const data = await this.repository.list(); this.activities = data.activities; this.revision = data.revision; this.loaded = true; this.error = ''; this.render(); }
    catch (error) { this.loaded = true; this.error = error.message || '无法读取活动计划，请重试。'; this.render(); }
  }
  visibleActivities() { return this.activities.filter(item => inMonth(item, this.month)).sort((a,b) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt)); }
  dayBackdrop() {
    const { days } = monthBounds(this.month); const today = localDate(); const [y,m] = this.month.split('-').map(Number);
    return Array.from({length:days},(_,i) => `<span class="grid-day ${[0,6].includes(new Date(y,m-1,i+1).getDay())?'weekend':''}" style="--day:${i+1}"></span>`).join('') + (today.startsWith(this.month) ? `<span class="today-line" style="--today:${Number(today.slice(8,10))}"></span>` : '');
  }
  visibleRange(item) {
    const b=monthBounds(this.month);
    const start=item.startDate<b.start?1:Number(item.startDate.slice(8,10));
    const end=item.endDate>b.end?b.days:Number(item.endDate.slice(8,10));
    return {start,end,days:end-start+1,clippedStart:item.startDate<b.start,clippedEnd:item.endDate>b.end};
  }
  phaseStrip(item, range) {
    const tracks=[];
    const phases=item.stages.filter(stage=>inMonth(stage,this.month)).sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.endDate.localeCompare(b.endDate)).map(stage=>{
      const visible=this.visibleRange(stage);
      let track=tracks.findIndex(lastEnd=>lastEnd<visible.start);
      if(track===-1)track=tracks.length;
      tracks[track]=visible.end;
      return `<button type="button" class="bar-phase" style="grid-column:${visible.start-range.start+1}/${visible.end-range.start+2};grid-row:${track+1}" data-edit="${escapeHTML(item.id)}" title="${escapeHTML(stage.name)} · ${stage.startDate} 至 ${stage.endDate}" aria-label="编辑${escapeHTML(item.title)}的${escapeHTML(stage.name)}阶段">${escapeHTML(stage.name)}</button>`;
    });
    return phases.length?`<div class="bar-phases" style="--span-days:${range.days};--phase-tracks:${tracks.length}" aria-label="活动阶段">${phases.join('')}</div>`:'';
  }
  activityRow(item) {
    const status=dateStatus(item), stage=currentStage(item), range=this.visibleRange(item);
    return `<div class="timeline-row"><div class="date-canvas">${this.dayBackdrop()}
      <article class="activity-bar ${status.key} ${range.clippedStart?'clipped-start':''} ${range.clippedEnd?'clipped-end':''}" style="grid-column:${range.start}/${range.end+1}" aria-label="${escapeHTML(item.title)} · ${item.startDate} 至 ${item.endDate}">
        <div class="bar-content">
          <button type="button" class="bar-title" data-edit="${escapeHTML(item.id)}" title="${escapeHTML(item.title)} · ${item.startDate} 至 ${item.endDate} · 点击编辑" aria-label="编辑${escapeHTML(item.title)}"><span>${escapeHTML(item.title)}</span>${icon('edit')}</button>
          <div class="bar-meta"><span class="bar-type">${escapeHTML(item.type)}</span><span class="bar-status">${escapeHTML(stage||status.text)}</span><span class="bar-range">${fmt(item.startDate)}–${fmt(item.endDate)}</span></div>
        </div>${this.phaseStrip(item,range)}
      </article>
    </div></div>`;
  }
  effectsFunnel() {
    return `<section class="effects" aria-label="活动效果转化漏斗">
      <div class="effects-head"><h2>活动效果 <span class="effects-subtitle">转化漏斗</span></h2><span class="effects-note">本月活动 · 接入小程序数据后显示</span></div>
      <ol class="funnel-track" aria-label="曝光、领取、参与人数">
        ${['曝光人数','领取人数','参与人数'].map((label,index)=>`<li class="funnel-step step-${index+1}"><div class="funnel-shape"><span class="funnel-label">${label}</span><div class="funnel-value"><strong>—</strong><span>人</span></div></div>${index<2?`<span class="funnel-arrow" aria-hidden="true">${icon('right')}</span>`:''}</li>`).join('')}
      </ol>
    </section>`;
  }
  render() {
    const previousScroll=this.shadowRoot.querySelector('.timeline-scroll')?.scrollLeft??0;
    const previousFocus=this.shadowRoot.activeElement;
    const focusSelector=previousFocus?.hasAttribute('data-new')?'[data-new]':previousFocus?.hasAttribute('data-edit')?`[data-edit="${previousFocus.dataset.edit}"]`:null;
    const b=monthBounds(this.month), items=this.visibleActivities(), today=localDate(); const [y,m]=this.month.split('-').map(Number);
    const running=items.filter(item=>dateStatus(item).key==='running').length;
    this.shadowRoot.innerHTML=`<link rel="stylesheet" href="./calendar.css"><style>${styles}</style><main class="shell">
      <header class="masthead"><div class="identity"><span class="mark">${icon('calendar')}</span><div><h1>活动计划</h1><div class="subtitle">排期与执行 <span class="tag">小程序</span></div></div></div><div class="actions"><button class="btn primary" data-new>${icon('plus')}新建活动</button></div></header>
      ${this.error?`<div class="error-banner" role="alert">${escapeHTML(this.error)}<button class="btn small" data-retry>重试</button></div>`:''}
      <section class="workspace" aria-label="月度活动排期">
        <div class="workspace-head"><div class="month-control"><button class="icon-btn" data-month="-1" aria-label="上个月">${icon('left')}</button><input class="month-picker" type="month" value="${this.month}" min="2000-01" max="2100-12" aria-label="查看月份"><button class="icon-btn" data-month="1" aria-label="下个月">${icon('right')}</button><button class="btn small quiet" data-today>本月</button></div><div class="counts"><span class="count">本月活动<strong>${items.length}</strong></span><span class="count">进行中<strong>${running}</strong></span></div></div>
        <div class="board-topline"><div class="calendar-board-title"><b>月度排期</b><button class="btn small" data-calendar-overview>万年历</button></div><div class="legend"><span class="legend-item"><i class="swatch"></i>活动</span><span class="legend-item"><i class="swatch stage"></i>阶段</span><span class="legend-item"><i class="swatch today"></i>今天</span></div></div>
        <div class="timeline-scroll" tabindex="0" role="region" aria-label="甘特图时间轴，可左右滚动"><div class="timeline" style="--days:${b.days}">
          <div class="timeline-row header"><div class="days">${Array.from({length:b.days},(_,i)=>{const d=new Date(y,m-1,i+1),current=`${this.month}-${String(i+1).padStart(2,'0')}`===today;const calendar=window.ActivityCalendar.info(`${this.month}-${String(i+1).padStart(2,'0')}`);return `<span title="${escapeHTML(calendar.title)}" class="day ${[0,6].includes(d.getDay())?'weekend':''} ${current?'current':''}"><span class="num">${i+1}</span><span>${'日一二三四五六'[d.getDay()]}</span><small class="calendar-day-label ${calendar.festivals.length?'festival':calendar.term?'term':''}">${escapeHTML(calendar.label)}</small>${calendar.festivals.length&&calendar.term?'<small class="calendar-day-label term">'+escapeHTML(calendar.term)+'</small>':''}</span>`}).join('')}</div></div>
          ${!this.loaded?'<div class="loading">正在读取活动计划…</div>':items.length?items.map(item=>this.activityRow(item)).join(''):`<div class="timeline-row empty-row"><div class="date-canvas">${this.dayBackdrop()}<div class="empty-content"><div class="empty-icon">${icon('calendar')}</div><h3>安排本月第一场活动</h3><p>填好起止日期，按需添加预热、正式或返场阶段。</p><button class="btn primary" data-new>${icon('plus')}新建活动</button></div></div></div>`}
        </div></div>
        <div class="board-foot"><span>${icon('edit')}点击时间条内的活动名称或阶段编辑</span><span>跨月活动持续显示 · 短条悬停可查看名称</span></div>
      </section>
      ${this.effectsFunnel()}
      <footer class="footer"><span class="storage">${icon('lock')}主机共享保存 · ${this.lastSaved?'刚刚已保存':'关闭后重开保留'}</span><span>活动与阶段按日期显示</span></footer>
    </main>`;
    const actionArea=this.shadowRoot.querySelector('.actions');
    actionArea.insertAdjacentHTML('afterbegin',`<button class="btn" data-backup>${icon('download')}备份</button><button class="btn" data-history>历史备份</button><button class="btn" data-restore>${icon('upload')}恢复</button><input type="file" data-import accept=".json,application/json" hidden aria-label="选择活动备份文件">`);
    this.bind();
    this.shadowRoot.querySelector('.timeline-scroll').scrollLeft=previousScroll;
    if(focusSelector)this.shadowRoot.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  bind() {
    this.shadowRoot.querySelector('[data-calendar-overview]').onclick=()=>window.ActivityCalendar.open({value:this.month+'-01',container:this.shadowRoot,onSelect:date=>{this.month=date.slice(0,7);this.render();}});
    this.shadowRoot.querySelectorAll('[data-month]').forEach(button=>button.addEventListener('click',()=>{const next=shiftMonth(this.month,Number(button.dataset.month));if(next<'2000-01'||next>'2100-12')return;this.month=next;this.render();}));
    this.shadowRoot.querySelector('.month-picker').addEventListener('change',event=>{if(/^\d{4}-\d{2}$/.test(event.target.value)&&event.target.value>='2000-01'&&event.target.value<='2100-12'){this.month=event.target.value;this.render();}});
    this.shadowRoot.querySelector('[data-today]').addEventListener('click',()=>{this.month=localDate().slice(0,7);this.render();});
    this.shadowRoot.querySelectorAll('[data-new]').forEach(button=>button.addEventListener('click',()=>this.openEditor()));
    this.shadowRoot.querySelectorAll('[data-edit]').forEach(button=>button.addEventListener('click',()=>this.openEditor(button.dataset.edit)));
    this.shadowRoot.querySelector('[data-retry]')?.addEventListener('click',()=>this.load());
    this.shadowRoot.querySelector('[data-backup]').addEventListener('click',()=>this.downloadBackup());
    const fileInput=this.shadowRoot.querySelector('[data-import]');
    this.shadowRoot.querySelector('[data-restore]').addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',()=>{if(fileInput.files[0])this.openRestore(fileInput.files[0]);fileInput.value='';});
  }
  replaceSaved(result) {
    const index=this.activities.findIndex(item=>item.id===result.activity.id);
    if(index===-1)this.activities.push(result.activity);else this.activities[index]=result.activity;
    this.revision=result.revision;this.lastSaved=new Date().toISOString();this.render();
    this.dispatchEvent(new CustomEvent('activity-board:change',{bubbles:true,composed:true,detail:{id:result.activity.id,revision:result.revision}}));
  }
  notify(message,error=false) {
    this.shadowRoot.querySelector('.notice')?.remove();const notice=document.createElement('div');notice.className=`notice${error?' error':''}`;notice.setAttribute('role',error?'alert':'status');notice.textContent=message;this.shadowRoot.append(notice);clearTimeout(this.noticeTimer);this.noticeTimer=setTimeout(()=>notice.remove(),4500);
  }
  openEditor(id = null, copy = false) {
    const previous=id?this.activities.find(item=>item.id===id):null;
    if(id&&!previous){this.notify('找不到这场活动，请刷新后重试',true);return;}
    if(this.editorDraft && !this.closeEditor())return;
    const startDate=localDate().startsWith(this.month)?localDate():`${this.month}-01`;
    this.editorDraft=previous?structuredClone(previous):{title:'',type:TYPES[0],startDate,endDate:startDate,rule:'',stages:[],platformRefs:[]};
    if(copy){delete this.editorDraft.id;delete this.editorDraft.revision;delete this.editorDraft.checks;this.editorDraft.title=`${previous.title}（副本）`;this.editorDraft.platformRefs=[];}
    this.dirty=false;this.saving=false;this.editorReturnFocus=this.shadowRoot.activeElement;
    const draft=this.editorDraft;
    const dialog=document.createElement('dialog');dialog.className='editor';dialog.setAttribute('aria-labelledby',`${this.uid}-editor-title`);
    dialog.innerHTML=`<form class="sheet"><header class="sheet-head"><div><h2 id="${this.uid}-editor-title">${draft.id?'编辑活动':copy?'复制活动':'新建活动'}</h2><p>${copy?'调整日期后保存为新活动':'安排日期，按需拆分阶段'}</p></div><button type="button" class="icon-btn" data-close aria-label="关闭活动编辑">${icon('close')}</button></header><div class="sheet-body"><div class="form-error" role="alert" hidden></div><label class="field"><span class="field-label">活动名称<span class="required">*</span></span><input class="input" name="title" data-field="title" value="${escapeHTML(draft.title)}" placeholder="例如：十月会员满减活动" required maxlength="120" autofocus></label><label class="field"><span class="field-label">活动类型<span class="required">*</span></span><select class="input" name="type" data-field="type">${TYPES.map(type=>`<option value="${type}" ${type===draft.type?'selected':''}>${type}</option>`).join('')}</select></label><div class="field-row"><label class="field"><span class="field-label">开始日期<span class="required">*</span></span><input type="date" name="startDate" data-field="startDate" class="input" value="${draft.startDate}" min="2000-01-01" max="2100-12-31" required></label><label class="field"><span class="field-label">结束日期<span class="required">*</span></span><input type="date" name="endDate" data-field="endDate" class="input" value="${draft.endDate}" min="2000-01-01" max="2100-12-31" required></label></div><label class="field"><span class="field-label">活动规则</span><textarea class="input" name="rule" data-field="rule" maxlength="4000" placeholder="例如：每满50元减10元，不与其他优惠叠加。">${escapeHTML(draft.rule)}</textarea></label><div class="section-head"><h3>活动阶段<small>可选</small></h3><button type="button" class="btn small" data-add-stage>${icon('plus')}添加阶段</button></div><div data-stages></div></div><footer class="sheet-foot">${draft.id?`<button type="button" class="btn quiet danger" data-delete>${icon('trash')}删除</button><button type="button" class="btn quiet" data-copy>复制活动</button>`:''}<div class="sheet-foot-actions"><button type="button" class="btn" data-close>取消</button><button type="submit" class="btn primary" data-save>保存活动</button></div></footer></form>`;
    this.shadowRoot.append(dialog);this.editorDialog=dialog;
    dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>this.closeEditor()));
    dialog.addEventListener('cancel',event=>{event.preventDefault();this.closeEditor();});
    dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))this.closeEditor();});
    dialog.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('input',()=>{this.editorDraft[input.dataset.field]=input.value;this.dirty=true;}));
    dialog.querySelector('[data-add-stage]').addEventListener('click',()=>{if(this.editorDraft.stages.length>=24){this.showEditorError('每场活动最多24个阶段');return;}this.editorDraft.stages.push({id:uid(),name:['预热','正式','返场'][this.editorDraft.stages.length]??`阶段${this.editorDraft.stages.length+1}`,startDate:this.editorDraft.startDate,endDate:this.editorDraft.endDate});this.dirty=true;this.renderEditorStages();});
    dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();this.saveEditor();});
    dialog.querySelector('[data-delete]')?.addEventListener('click',()=>this.deleteEditor());
    dialog.querySelector('[data-copy]')?.addEventListener('click',()=>{const planId=this.editorDraft.id;if(this.closeEditor())this.openEditor(planId,true);});
    this.renderEditorStages();window.ActivityCalendar.mount(this.editorDialog);dialog.showModal();
    this.beforeUnload=event=>{if(this.dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',this.beforeUnload);
  }
  renderEditorStages() {
    const target=this.editorDialog.querySelector('[data-stages]');
    target.innerHTML=this.editorDraft.stages.length?this.editorDraft.stages.map((stage,index)=>`<div class="stage-form"><div class="stage-form-head"><input class="input" data-stage="${stage.id}" data-stage-field="name" value="${escapeHTML(stage.name)}" maxlength="80" required aria-label="第${index+1}阶段名称"><button type="button" class="remove-stage" data-remove-stage="${stage.id}" aria-label="删除第${index+1}阶段">${icon('close')}</button></div><div class="field-row"><label class="field"><span class="field-label">阶段开始</span><input class="input" type="date" data-stage="${stage.id}" data-stage-field="startDate" value="${stage.startDate}" min="2000-01-01" max="2100-12-31" required aria-label="第${index+1}阶段开始日期"></label><label class="field"><span class="field-label">阶段结束</span><input class="input" type="date" data-stage="${stage.id}" data-stage-field="endDate" value="${stage.endDate}" min="2000-01-01" max="2100-12-31" required aria-label="第${index+1}阶段结束日期"></label></div></div>`).join(''):'<div class="stage-placeholder">不分阶段时，只需填写活动起止日期。</div>';
    target.querySelectorAll('[data-stage]').forEach(input=>input.addEventListener('input',()=>{this.editorDraft.stages.find(stage=>stage.id===input.dataset.stage)[input.dataset.stageField]=input.value;this.dirty=true;}));
    target.querySelectorAll('[data-remove-stage]').forEach(button=>button.addEventListener('click',()=>{this.editorDraft.stages=this.editorDraft.stages.filter(stage=>stage.id!==button.dataset.removeStage);this.dirty=true;this.renderEditorStages();}));
    window.ActivityCalendar.mount(this.editorDialog);
  }
  showEditorError(message) {const area=this.editorDialog.querySelector('.form-error');area.textContent=message;area.hidden=false;area.scrollIntoView({block:'nearest'});}
  setEditorSaving(value) {this.saving=value;this.editorDialog.querySelectorAll('button,input,select,textarea').forEach(input=>input.disabled=value);this.editorDialog.querySelector('[data-save]').textContent=value?'正在保存…':'保存活动';}
  async savePlan(draft) {
    normalizeActivity(draft,()=>uid());
    const result=draft.id?await this.repository.update(draft.id,draft):await this.repository.create(draft);
    this.month=inMonth(result.activity,this.month)?this.month:result.activity.startDate.slice(0,7);
    return result;
  }
  async saveEditor() {
    if(this.saving)return;this.setEditorSaving(true);
    try {const result=await this.savePlan(this.editorDraft);this.closeEditor(true);this.replaceSaved(result);this.notify('活动已保存到主机');}
    catch(error){this.setEditorSaving(false);this.showEditorError(error.message);}
  }
  removeBeforeUnload() {if(this.beforeUnload){window.removeEventListener('beforeunload',this.beforeUnload);this.beforeUnload=null;}}
  closeEditor(force=false) {
    if(!this.editorDialog)return true;
    if(!force&&(this.saving||this.dirty&&!confirm('有未保存的修改，确认放弃吗？')))return false;
    this.editorDialog.close();this.editorDialog.remove();this.editorDialog=null;this.editorDraft=null;this.dirty=false;this.saving=false;this.removeBeforeUnload();this.editorReturnFocus?.focus();return true;
  }
  async deleteEditor() {
    if(this.saving||!confirm(`删除“${this.editorDraft.title}”？删除前会自动备份活动计划。`))return;
    this.setEditorSaving(true);
    try {const id=this.editorDraft.id;const result=await this.repository.remove(id,this.editorDraft.revision);this.closeEditor(true);this.activities=this.activities.filter(item=>item.id!==id);this.revision=result.revision;this.lastSaved=new Date().toISOString();this.render();this.notify('活动已删除，删除前的计划已自动备份');this.dispatchEvent(new CustomEvent('activity-board:change',{bubbles:true,composed:true,detail:{id,deleted:true,revision:result.revision}}));}
    catch(error){this.setEditorSaving(false);this.showEditorError(error.message);}
  }
  async downloadBackup() {
    const button=this.shadowRoot.querySelector('[data-backup]');button.disabled=true;
    try {
      let href,count,objectURL=false;
      if(typeof this.repository.createBackup==='function'){
        const result=await this.repository.createBackup();href=new URL(result.downloadPath,location.href).href;
        if(new URL(href).origin!==location.origin)throw new Error('备份下载地址须与当前页面同源');count=result.activities;
      }else{const backup=await this.repository.exportBackup();href=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));count=backup.activities.length;objectURL=true;}
      const dialog=document.createElement('dialog');dialog.className='restore-dialog';dialog.setAttribute('aria-labelledby',`${this.uid}-backup-title`);
      dialog.innerHTML=`<h2 id="${this.uid}-backup-title">备份已生成</h2><p>${count} 场活动的计划与阶段已备份。${objectURL?'下载文件后可用于恢复。':'备份文件已保存到本机，也可下载一份留存。'}</p><div class="dialog-actions"><button class="btn" data-close-backup>完成</button><a class="btn primary" role="button" data-download-backup href="${escapeHTML(href)}" download="活动计划备份-${localDate()}.json" style="text-decoration:none">${icon('download')}下载文件</a></div>`;
      const close=()=>{dialog.close();dialog.remove();if(objectURL)URL.revokeObjectURL(href);};
      this.shadowRoot.append(dialog);dialog.querySelector('[data-close-backup]').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.showModal();
    }
    catch(error){this.notify(error.message,true);}finally{button.disabled=false;}
  }
  async openRestore(file) {
    try {
      if(file.size>2*1024*1024)throw new Error('请选择小于2MB的备份文件');
      const backup=normalizeBackup(JSON.parse(await file.text()),()=>uid());
      const expectedRevision=this.revision;const dialog=document.createElement('dialog');dialog.className='restore-dialog';dialog.setAttribute('aria-labelledby',`${this.uid}-restore-title`);
      dialog.innerHTML=`<h2 id="${this.uid}-restore-title">恢复活动备份</h2><p>${escapeHTML(file.name)}</p><div class="restore-summary"><span>当前活动<strong> ${this.activities.length}</strong></span><span>备份活动<strong> ${backup.activities.length}</strong></span></div><p>恢复后将使用备份中的活动计划。当前计划会先自动备份到主机，现有平台活动数据不会被修改。</p><div class="form-error" role="alert" hidden></div><div class="dialog-actions"><button class="btn" data-cancel>取消</button><button class="btn primary" data-confirm>确认恢复</button></div>`;
      this.shadowRoot.append(dialog);dialog.showModal();let pending=false;
      const close=()=>{if(pending)return;dialog.close();dialog.remove();};dialog.querySelector('[data-cancel]').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
      dialog.querySelector('[data-confirm]').addEventListener('click',async()=>{pending=true;dialog.querySelectorAll('button').forEach(button=>button.disabled=true);
        try {const result=await this.repository.restoreBackup(backup,expectedRevision);pending=false;close();this.activities=result.activities;this.revision=result.revision;this.lastSaved=new Date().toISOString();this.render();this.notify('计划备份已恢复，原计划已自动备份');this.dispatchEvent(new CustomEvent('activity-board:change',{bubbles:true,composed:true,detail:{restored:true,revision:result.revision}}));}
        catch(error){pending=false;dialog.querySelectorAll('button').forEach(button=>button.disabled=false);const area=dialog.querySelector('.form-error');area.hidden=false;area.textContent=error.message;}
      });
    }catch(error){this.notify(error instanceof SyntaxError?'请选择有效的活动计划备份文件':error.message,true);}
  }
  registerTools() {
    const context=document.modelContext;if(!context?.registerTool)return;
    this.toolLifecycle?.abort();this.toolLifecycle=new AbortController();
    const prefix=this.getAttribute('tool-prefix')??'activity_board';
    const inputObject=input=>{if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('输入须为对象');return input;};
    const schemas={title:{type:'string'},type:{type:'string',enum:TYPES},startDate:{type:'string'},endDate:{type:'string'},rule:{type:'string'},stages:{type:'array',items:{type:'object',properties:{name:{type:'string'},startDate:{type:'string'},endDate:{type:'string'}},required:['name','startDate','endDate'],additionalProperties:false}}};
    const requireIdle=()=>{if(this.editorDraft)throw new Error('请先保存或关闭编辑面板');};
    const definitions=[
      {name:`${prefix}_list`,title:'读取活动计划',description:'读取本页已保存的活动计划与阶段。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async input=>{inputObject(input);return {revision:this.revision,month:this.month,activities:this.activities};}},
      {name:`${prefix}_create`,title:'新建活动',description:'创建并保存小程序活动计划，同时更新本页排期。',inputSchema:{type:'object',properties:schemas,required:['title','type','startDate','endDate'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async input=>{requireIdle();const draft=inputObject(input);if(Object.keys(draft).some(key=>!Object.hasOwn(schemas,key)))throw new Error('含有不支持的字段');const result=await this.savePlan({...draft,platformRefs:[]});this.replaceSaved(result);return {id:result.activity.id,title:result.activity.title,revision:result.activity.revision};}},
      {name:`${prefix}_update`,title:'修改活动',description:'修改已保存活动的名称、类型、日期、规则或阶段，同时更新本页排期。',inputSchema:{type:'object',properties:{id:{type:'string'},...schemas},required:['id'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async input=>{requireIdle();inputObject(input);const previous=this.activities.find(item=>item.id===input.id);if(!previous)throw new Error('找不到这场活动');const allowed=['id',...Object.keys(schemas)];if(Object.keys(input).some(key=>!allowed.includes(key)))throw new Error('含有不支持的字段');const result=await this.savePlan({...previous,...input});this.replaceSaved(result);return {id:result.activity.id,title:result.activity.title,revision:result.activity.revision};}},
      {name:`${prefix}_show_month`,title:'查看月份',description:'切换本页显示月份，不修改已保存的活动计划。',inputSchema:{type:'object',properties:{month:{type:'string',pattern:'^\\d{4}-(0[1-9]|1[0-2])$'}},required:['month'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{requireIdle();inputObject(input);if(typeof input.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)||input.month<'2000-01'||input.month>'2100-12')throw new Error('请选择2000—2100年的有效月份');this.month=input.month;this.render();return {month:this.month,activities:this.visibleActivities().length};}},
    ];
    for(const definition of definitions){try{Promise.resolve(context.registerTool(definition,{signal:this.toolLifecycle.signal})).catch(()=>{});}catch{}}
  }
}
if(!customElements.get('activity-plan-board'))customElements.define('activity-plan-board',ActivityBoard);
