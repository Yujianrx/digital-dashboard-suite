(function(root){
'use strict';
const M=root.PlatformModel,C=root.CoreModel,D=root.Demo,reserved=['平台','活动编号','活动名称','活动类型','日期'],MAX_ROWS=30000;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const blank=v=>v==null||String(v).trim()==='';
const numeric=v=>!blank(v)&&Number.isFinite(Number(v));
const platform=id=>D.platforms.find(p=>p.id===id);
const header=f=>reserved.includes(f.label)?'指标：'+f.label:f.label;
let ctx,busy=false;
function dateValue(value,date1904){
 let result;
 if(typeof value==='number'){const d=XLSX.SSF.parse_date_code(value,{date1904:!!date1904});if(!d||d.H||d.M||d.S)throw Error('日期无效或包含时间');result=`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`}
 else{const match=String(value??'').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);if(!match)throw Error('日期请填写 YYYY-MM-DD');result=match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0')}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||D.iso(D.dt(result))!==result||result<'1900-01-01'||result>D.cutoff)throw Error('日期无效或晚于今天');return result;
}
function metadata(book){if(!book.Sheets['模板信息'])return null;const rows=XLSX.utils.sheet_to_json(book.Sheets['模板信息'],{header:1,defval:''});return Object.fromEntries(rows.filter(r=>r[0]).map(r=>[String(r[0]),String(r[1]??'')]))}
function append(book,name,rows){const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=rows[0].map((_,i)=>({wch:i<5?22:18}));if(rows.length>1)sheet['!autofilter']={ref:sheet['!ref']};XLSX.utils.book_append_sheet(book,sheet,name)}
function guide(book,kind,id){append(book,'模板信息',[['模板版本','V11.3'],['导入范围',kind],['范围标识',id]]);append(book,'填写说明',[
 ['项目','说明'],['范围',kind==='platform'?platform(id).name+'全部活动':C.title(id)],['模板日期','按页面选择的期间生成；可自行增加历史日期，不能晚于今天。'],['更新规则','按活动/模块＋日期＋字段更新，0 会写入；空白、未出现的日期和字段保留原值。'],['校验','整份文件校验通过后预览并确认；任一错误都不会部分导入。'],['活动编号','已有活动保留编号；新增活动编号留空，填写名称与类型。'],['活动类型','填业绩活动或转化率活动；已有活动须与当前分类一致。'],['字段','使用当前配置的字段名；设置有变更请重新下载模板。'],['公式','请粘贴为数值后上传，不接受公式单元格。'],['核心模块','两个核心模块独立保存导入数据；所填字段优先于关联活动值，缺项沿用原来源。'],['会员口径','消费会员人次按每日人数相加，不能作为期间去重人数。'],['客单价','自动按同日金额与订单数计算，客单价列不导入；小程序核心模板的销量沿用已确认的有效订单数口径。']]);}
function template(kind,id,r){const book=XLSX.utils.book_new();if(kind==='platform'){
  for(const [typeId,label] of Object.entries(M.typeNames)){const fs=M.scopeFields(id,null,typeId),rows=[[...reserved,...fs.map(header)]],list=M.read(id).activities.filter(a=>M.activityType(id,a.id)===typeId);for(const a of list)for(const date of r.days)rows.push([platform(id).name,a.id,a.name,label,date,...fs.map(()=> '')]);append(book,label,rows)}
 }else{append(book,'核心业绩数据',[['模块标识','模块名称','日期',...C.fields(id).map(f=>f.label)],...r.days.map(date=>[id,C.title(id),date,...C.fields(id).map(()=> '')])])}
 guide(book,kind,id);return book;
}
function tableSheets(book,kind){const ignored=new Set(['模板信息','填写说明','字段说明']);return book.SheetNames.filter(n=>!ignored.has(n)).map(name=>{const sheet=book.Sheets[name],range=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']):null;if(!range)return {name,sheet,rows:[]};if(range.e.r+1>MAX_ROWS||range.e.c>55||range.s.r!==0||range.s.c!==0)throw Error(name+'：表格应从 A1 开始，最多 30,000 行、56 列');return {name,sheet,rows:XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:true})}})}
function newPlan(kind,id){return {kind,id,baseline:JSON.stringify(kind==='platform'?M.read(id):C.read()),next:M.clone(kind==='platform'?M.read(id):C.read()),changes:[],errors:[],errorCount:0,newActivities:[],activityNames:new Set(),dates:new Set(),rows:0,unchanged:0,blank:0,seen:new Set()}}
function issue(plan,where,message){plan.errorCount++;if(plan.errors.length<80)plan.errors.push(where+'：'+message)}
function planImport(kind,id,book){
 if(!['platform','core'].includes(kind)||!(kind==='platform'?platform(id):['mini','member'].includes(id)))throw Error('导入目标无效');
 const plan=newPlan(kind,id),meta=metadata(book);if(meta&&(meta['导入范围']!==kind||meta['范围标识']!==id))throw Error('模板属于其他平台或模块，请在对应入口导入');
 const tables=tableSheets(book,kind);if(!tables.length)throw Error('工作簿没有数据表');let totalRows=0;
 for(const {name,sheet,rows} of tables){if(!rows.length)continue;totalRows+=Math.max(0,rows.length-1);if(totalRows>MAX_ROWS)throw Error('整份文件最多导入 30,000 行');
  const headers=rows[0].map(v=>String(v??'').replace(/^\ufeff/,'').trim()),seenHeaders=new Set();let bad=false;
  for(const h of headers.filter(Boolean)){if(seenHeaders.has(h)){issue(plan,name,'表头重复：'+h);bad=true}seenHeaders.add(h)}
  const fixed=kind==='platform'?reserved:['模块标识','模块名称','日期'],allFields=kind==='platform'?M.fields(id):C.fields(id);
  const derived=kind==='core'?[C.ticketField(id).label]:[];
  const mapping=headers.map(h=>fixed.includes(h)||derived.includes(h)?null:allFields.find(f=>h===header(f)||h===f.label||(kind==='core'&&id==='mini'&&f.id==='sales'&&h==='有效订单数')));
  const unknown=headers.filter((h,j)=>h&&!fixed.includes(h)&&!derived.includes(h)&&!mapping[j]);if(unknown.length){issue(plan,name,'未匹配字段：'+unknown.join('、')+'。请下载最新模板。');bad=true}
  const dateCol=headers.indexOf('日期');if(dateCol<0){issue(plan,name,'缺少“日期”列');bad=true}
  if(kind==='platform')for(const h of ['平台','活动名称','活动类型'])if(!headers.includes(h)){issue(plan,name,'缺少“'+h+'”列');bad=true}
  if(!mapping.some(Boolean)){issue(plan,name,'没有可导入的指标列');bad=true}
  const mappedIds=mapping.filter(Boolean).map(f=>f.id);if(new Set(mappedIds).size!==mappedIds.length){issue(plan,name,'多个列对应同一指标');bad=true}
  if(bad)continue;
  for(let rowIndex=1;rowIndex<rows.length;rowIndex++){const row=rows[rowIndex],where=name+' 第 '+(rowIndex+1)+' 行';if(row.every(blank))continue;
   try{
    for(let j=0;j<row.length;j++){const cell=sheet[XLSX.utils.encode_cell({r:rowIndex,c:j})];if(cell?.f)throw Error('包含公式，请粘贴为数值后导入');if(cell?.t==='e')throw Error('存在 Excel 错误值');if(!blank(row[j])&&!headers[j])throw Error('存在没有表头的非空列')}
    const provided=mapping.map((f,j)=>({f,j,value:row[j]})).filter(x=>x.f&&!blank(x.value));if(!provided.length){plan.blank++;continue}
    const date=dateValue(row[dateCol],book.Workbook?.WBProps?.date1904);let target,entity,nameValue,targetData,typeId;
    if(kind==='platform'){
     const p=String(row[headers.indexOf('平台')]??'').trim();if(p!==platform(id).name&&p!==id)throw Error('平台不匹配，只能更新 '+platform(id).name);
     nameValue=String(row[headers.indexOf('活动名称')]??'').trim();const code=String(row[headers.indexOf('活动编号')]??'').trim(),label=String(row[headers.indexOf('活动类型')]??'').trim();typeId=Object.keys(M.typeNames).find(k=>label===k||label===M.typeNames[k]);if(!typeId)throw Error('活动类型须为“业绩活动”或“转化率活动”');
     if(code){target=plan.next.activities.find(a=>a.id===code);if(!target)throw Error('活动编号不存在或属于其他平台');if(nameValue&&target.name!==nameValue)throw Error('活动名称与编号不一致，请下载最新模板');nameValue=target.name}
     else{if(!nameValue||nameValue.length>80)throw Error('活动名称需为 1–80 个字');const matches=plan.next.activities.filter(a=>a.name===nameValue);if(matches.length>1)throw Error('存在同名活动，请填写活动编号');target=matches[0]}
     if(target){const storedType=target.activityTypeId||target.mode;const effective=M.typeNames[storedType]?storedType:'performance';if(effective!==typeId)throw Error('活动类型与已有记录不同，请先在页面调整分类')}
     const allowed=M.scopeFields(id,null,typeId);for(const {f} of provided)if(!allowed.some(a=>a.id===f.id))throw Error(M.typeNames[typeId]+'未启用字段“'+f.label+'”，请在类型配置中开启');
     if(!target){target={id:M.uid('act'),name:nameValue,mode:typeId,activityTypeId:typeId,createdAt:new Date().toISOString(),data:{},events:[]};plan.next.activities.push(target);plan.newActivities.push(target.id)}
     entity=target.id;targetData=target.data||={};plan.activityNames.add(nameValue);
    }else{const moduleCol=headers.indexOf('模块标识');if(moduleCol>=0&&!blank(row[moduleCol])&&String(row[moduleCol]).trim()!==id)throw Error('模块标识不匹配');entity=id;nameValue=C.title(id);targetData=plan.next.modules[id].rows;}
    const rowKey=entity+'|'+date;if(plan.seen.has(rowKey))throw Error('同一活动或模块的日期重复，请合并后导入');plan.seen.add(rowKey);
    const parsed=provided.map(x=>{let value=x.value;const cell=sheet[XLSX.utils.encode_cell({r:rowIndex,c:x.j})];if(x.f.type==='percent'&&typeof value==='number'&&cell?.w?.includes('%'))value=value*100;return {f:x.f,value:M.parse(value,x.f)}});
    targetData[date]||={};
    for(const {f,value} of parsed){const prior=targetData[date][f.id];if(prior===value){plan.unchanged++;continue}const displayed=kind==='core'?C.row(id,date)[f.id]:prior;plan.changes.push({entity,name:nameValue,date,field:f.id,label:f.label,old:displayed??'',value,type:f.type});targetData[date][f.id]=value}
    plan.rows++;plan.dates.add(date);
   }catch(e){issue(plan,where,e.message)}
  }
 }
 if(!plan.errorCount&&!plan.changes.length)issue(plan,'文件',plan.unchanged?'填写的数值与已有导入记录一致，无需更新':'没有非空指标值，请填写模板后再导入');
 return plan;
}
function commit(plan){if(plan.errorCount)throw Error('请修正所有错误后重新导入');if(!plan.changes.length)throw Error('没有可提交的更新');const current=JSON.stringify(plan.kind==='platform'?M.read(plan.id):C.read());if(current!==plan.baseline)throw Error('预览后数据或设置已变化，请重新上传校验');if(plan.kind==='platform')M.save(plan.id,plan.next);else C.save(plan.next)}
function panel(id){return `<section class="panel bulk-import-panel"><div><span class="small-overline">平台活动批量更新</span><h2>${esc(platform(id).name)} · 全量活动数据导入</h2><p>一次更新多个活动；模板按两类活动和当前字段生成，包含本期日期。未填写的数值保留原记录。</p></div><div class="bulk-import-actions"><button class="outline" data-import-action="template" data-import-kind="platform" data-import-id="${id}">下载模板 ↓</button><button class="primary" data-import-action="upload" data-import-kind="platform" data-import-id="${id}">批量导入活动数据</button></div></section>`}
function coreActions(id){return `<div class="core-actions"><button class="text-button" data-import-action="rename" data-import-id="${id}" aria-label="修改${esc(C.title(id))}名称">✎ 修改名称</button><button class="outline" data-import-action="template" data-import-kind="core" data-import-id="${id}">下载模板</button><button class="primary" data-import-action="upload" data-import-kind="core" data-import-id="${id}">导入数据</button></div>`}
function closeDialog(el){if(!busy)el.close()}
function dialog(title,body){document.querySelector('#importDialog')?.remove();const el=document.createElement('dialog');el.id='importDialog';el.setAttribute('aria-labelledby','importTitle');el.innerHTML=`<div class="dialog-head"><h2 id="importTitle">${esc(title)}</h2><button class="icon-button" data-import-close aria-label="关闭导入窗口">×</button></div>${body}`;document.body.append(el);el.querySelectorAll('[data-import-close]').forEach(b=>b.onclick=()=>closeDialog(el));el.addEventListener('cancel',e=>{if(busy)e.preventDefault()});el.addEventListener('close',()=>el.remove());el.showModal();return el}
function preview(plan,filename){const ds=[...plan.dates].sort(),overwrites=plan.changes.filter(c=>c.old!==''&&c.old!==undefined&&c.old!==null&&String(c.old)!==String(c.value)).length,target=plan.kind==='platform'?platform(plan.id).name+'全部活动':C.title(plan.id),ok=!plan.errorCount;
 const body=`<div class="import-body"><p class="import-file">${esc(filename)} · 目标：${esc(target)}</p>${ok?`<div class="import-summary"><div><b>${plan.rows}</b><span>有效数据行</span></div><div><b>${plan.changes.length}</b><span>更新单元格</span></div><div><b>${overwrites}</b><span>修改已有数值</span></div><div><b>${plan.newActivities.length}</b><span>新增活动</span></div></div><p>${esc(ds[0]||'')} 至 ${esc(ds.at(-1)||'')} · ${plan.kind==='platform'?plan.activityNames.size+' 个活动':'当前核心模块'} · ${plan.unchanged} 个相同值跳过</p><p class="import-rule">${plan.kind==='core'?'数据仅导入当前核心模块，所填字段优先于关联活动数据；':'仅更新当前平台的匹配活动；'}空白、未出现的字段及日期保留。0 会按实际零值写入。</p><div class="table-scroll import-preview"><table><thead><tr><th>活动 / 模块</th><th>日期</th><th>字段</th><th>原显示值</th><th>导入值</th></tr></thead><tbody>${plan.changes.slice(0,60).map(c=>`<tr><td>${esc(c.name)}</td><td>${c.date}</td><td>${esc(c.label)}</td><td>${esc(c.old===''?'未录入':c.old)}</td><td>${esc(c.value)}</td></tr>`).join('')}</tbody></table></div>${plan.changes.length>60?'<p>预览前 60 项；确认后提交全部 '+plan.changes.length+' 项更新。</p>':''}`:`<div class="validation-message">发现 ${plan.errorCount} 处问题，本次没有导入数据。</div><ul class="import-errors">${plan.errors.map(e=>'<li>'+esc(e)+'</li>').join('')}</ul>${plan.errorCount>80?'<p>仅列出前 80 处问题，请先修正后再次上传。</p>':''}`}<p id="importStatus" role="status"></p></div><div class="dialog-foot"><button class="outline" data-import-close>${ok?'取消':'关闭并修改文件'}</button>${ok?'<button class="primary" id="commitImport">确认导入 '+plan.changes.length+' 个值</button>':''}</div>`;
 const el=dialog(ok?'确认批量更新':'导入校验未通过',body);if(ok)el.querySelector('#commitImport').onclick=async()=>{const button=el.querySelector('#commitImport'),status=el.querySelector('#importStatus');button.disabled=true;busy=true;let queued=false;try{commit(plan);queued=true;status.textContent='已提交，正在保存到主机…';ctx.render();await root.__flushSharedStorage();status.textContent='导入完成，已保存到主机。';button.textContent='已保存';el.querySelector('[data-import-close].outline').textContent='完成';ctx.toast('已导入 '+plan.rows+' 行，全部保存到主机')}catch(e){status.textContent=queued?'尚未保存到主机：'+e.message+'。修改仍留在页面，请使用共享数据管理的重试或核对功能。':'未导入：'+e.message;status.className='validation-message';button.textContent=queued?'等待处理保存问题':'请重新上传校验';ctx.toast(status.textContent)}finally{busy=false}};
}
async function upload(file,kind,id){if(!file)return;if(file.size>15*1024*1024){ctx.toast('文件不能超过 15 MB');return}try{const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,cellFormula:true}),plan=planImport(kind,id,book);preview(plan,file.name)}catch(e){dialog('无法导入文件',`<div class="import-body"><p class="validation-message">${esc(e.message)}</p><p>本次没有导入数据，请检查文件后重试。</p></div><div class="dialog-foot"><button class="primary" data-import-close>关闭</button></div>`)}}
function rename(id){const el=dialog('修改模块名称',`<form id="renameCoreForm"><div class="import-body"><label>模块名称<input name="name" value="${esc(C.title(id))}" maxlength="24" required aria-label="核心模块名称"></label><p>名称同步到总览、侧栏、明细页和导出文件，数据保留。</p><p id="renameError" role="alert"></p></div><div class="dialog-foot"><button type="button" class="outline" data-import-close>取消</button><button class="primary" type="submit">保存名称</button></div></form>`);el.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=el.querySelector('[type="submit"]');b.disabled=true;busy=true;let queued=false;try{C.rename(id,new FormData(e.target).get('name'));queued=true;ctx.render();await root.__flushSharedStorage();busy=false;el.close();ctx.toast('模块名称已保存')}catch(error){el.querySelector('#renameError').textContent=(queued?'已提交但尚未保存到主机：':'')+error.message;if(!queued)b.disabled=false}finally{busy=false}}}
function filename(s){return s.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,80)}
function bind(options){ctx=options;if(bind.done)return;bind.done=true;document.querySelector('#view').addEventListener('click',e=>{const b=e.target.closest('[data-import-action]');if(!b)return;const action=b.dataset.importAction,kind=b.dataset.importKind,id=b.dataset.importId;try{if(action==='rename'){rename(id);return}if(action==='template'){const r=ctx.range();XLSX.writeFile(template(kind,id,r),filename((kind==='platform'?platform(id).name+'_全量活动':C.title(id))+'_导入模板_'+r.start+'_'+r.end)+'.xlsx');ctx.toast('模板已下载，请填写数值后导入');return}if(action==='upload'){const input=document.createElement('input');input.type='file';input.accept='.xlsx,.xls,.csv';input.hidden=true;input.id='batchImportFile';document.querySelector('#batchImportFile')?.remove();document.body.append(input);input.onchange=()=>upload(input.files[0],kind,id);input.click()}}catch(error){ctx.toast(error.message)}})}
root.ImportCenter={bind,panel,coreActions,template,planImport,commit,dateValue,filename};
})(window);
