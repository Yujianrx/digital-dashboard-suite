(function(root){
  'use strict';
  const M=root.StoreRankModel,D=root.Demo,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const head=['日期','门店编号','门店名称','小程序实收（元）','储值实收（元）'];
  const cash=n=>n===null||n===undefined?'未录入':'¥'+(n/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const span=(s,e)=>s?(s===e?s:s+' — '+e):'无对应日期';
  let ctx,lastPreview=null;
  function change(row){
    if(row.diff===null)return '<span class="rank-muted">暂无可比数据</span>';
    const cls=row.diff>0?'rank-up':row.diff<0?'rank-down':'rank-muted';
    return `<span class="${cls}">${row.diff>0?'增加 ':row.diff<0?'减少 ':'持平 '}${esc(cash(Math.abs(row.diff)))}</span><small class="${cls}">${row.growth===null?'无比较基数':(row.growth>0?'+':'')+row.growth.toFixed(1)+'%'}</small>`;
  }
  function panel(metric,label,r){
    const list=M.rank(metric,r.days,r.prevDays);
    return `<section class="panel store-ranking" data-rank-metric="${metric}"><div class="rank-heading"><div><span class="rank-overline">STORE TOP 20</span><h2>${label}</h2><p>本期 ${list.total} 家门店有数据 · 按实收从高到低</p></div><span class="rank-count">TOP ${Math.min(20,list.total)}</span></div>${list.rows.length?`<div class="rank-table-scroll"><table><thead><tr><th>排名</th><th>门店</th><th>本期 / 对比实收</th><th>增减</th></tr></thead><tbody>${list.rows.map(row=>`<tr data-ranked-store="${esc(row.id)}"><td><span class="rank-position place-${row.position}">${row.position}</span></td><td class="rank-store"><strong title="${esc(row.name)}">${esc(row.name)}</strong><small>${row.code?'编号 '+esc(row.code):'未设编号'} · 已录入 ${row.currentDays} 天</small></td><td class="rank-amount"><strong>${esc(cash(row.current))}</strong><small title="${esc(r.compareLabel+' '+span(r.prevStart,r.prevEnd))}">${esc(r.compareLabel)} ${esc(cash(row.previous))}</small></td><td class="rank-change">${change(row)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="rank-empty"><span>▤</span><h3>此区间暂无${label.replace('排行','')}数据</h3><p>下载模板并导入门店明细，或调整查看日期。空白不计入排行，已录入0正常参与。</p><button class="outline" data-rank-action="import">导入门店明细</button></div>`}<div class="rank-foot">仅统计新导入的门店明细；同额按门店名称和编号排序。</div></section>`;
  }
  function render(r){
    try{
      const data=M.read(),stores=Object.values(data.stores),dates=stores.flatMap(s=>Object.keys(s.rows)).sort(),latest=dates.at(-1);
      return `<section class="panel rank-intro"><div><span class="rank-overline">INDEPENDENT STORE PERFORMANCE</span><h2>门店业绩排行</h2><p>小程序实收与储值实收分别排名，按上方日期筛选统计。</p><div class="rank-data-status"><span>已导入 ${stores.length} 家门店</span><span>${latest?'数据最新日期 '+esc(latest):'尚未导入门店数据'}</span></div></div><div class="rank-actions"><button class="outline" data-rank-action="template">下载模板 ↓</button><button class="primary" data-rank-action="import">导入门店明细</button><button class="outline" data-rank-action="export">导出当前排行 ↓</button></div></section>${M.hasPending()?'<div class="rank-pending">有门店数据尚未保存到主机。<button class="text-button" data-rank-action="resume">重新打开保存窗口</button></div>':''}<div class="rank-periods"><span>本期 ${esc(span(r.start,r.end))}</span><span>${esc(r.compareLabel)} ${esc(span(r.prevStart,r.prevEnd))}</span></div><div class="store-rank-grid">${panel('mini','小程序实收排行',r)}${panel('recharge','储值实收排行',r)}</div><p class="rank-scope-note">本页独立保存门店明细，不汇入现有两个业绩看板。排行仅显示本期有记录的前20家门店，未录入与实际零值分别处理。</p><input type="file" id="storeRankImport" accept=".xlsx,.xls,.csv" hidden>`;
    }catch(e){return `<section class="panel rank-error"><h2>无法读取门店排行</h2><p>${esc(e.message)}</p><p>请使用共享数据管理核对备份，原数据仍保留。</p></section>`;}
  }
  function book(rows,name){const ws=root.XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:14},{wch:18},{wch:36},{wch:22},{wch:22},{wch:20},{wch:20}];const wb=root.XLSX.utils.book_new();root.XLSX.utils.book_append_sheet(wb,ws,name);return wb;}
  function template(){
    const wb=book([head,[root.DateFilter.completed(),'','','','']],'门店业绩');
    const notes=[['填写说明'],['日期','YYYY-MM-DD，2000年起至今天；支持历史日期'],['门店编号','建议填写稳定编号，按文本填写以保留前导零；无编号时按名称识别门店'],['门店名称','必填；有编号的门店改名保持同一编号'],['小程序实收（元）','金额最多2位小数；可为负数退款'],['储值实收（元）','金额最多2位小数；可为负数退款'],['更新规则','同门店同日期更新已填写金额；空白保留，0写入；重复行请先合并'],['确认规则','整份文件验证后预览确认，公式需先转换为数值；最多30000行、15MB'],['数据范围','仅用于独立门店排行，不改写现有两个核心业绩看板']];
    root.XLSX.utils.book_append_sheet(wb,root.XLSX.utils.aoa_to_sheet(notes),'填写说明');root.XLSX.writeFile(wb,'门店业绩导入模板.xlsx');ctx.toast('已下载门店排行专用模板');
  }
  function exportRank(){
    const r=ctx.range(),rows=[['业绩类型','排名','门店编号','门店名称','本期开始','本期结束','对比方式','对比开始','对比结束','本期实收（元）','对比实收（元）','增减金额（元）','增减幅度']];
    for(const [metric,label]of [['mini','小程序实收'],['recharge','储值实收']])for(const row of M.rank(metric,r.days,r.prevDays).rows)rows.push([label,row.position,row.code,row.name,r.start,r.end,r.compareLabel,r.prevStart,r.prevEnd,row.current/100,row.previous===null?'':row.previous/100,row.diff===null?'':row.diff/100,row.growth===null?'':row.growth.toFixed(2)+'%']);
    root.XLSX.writeFile(book(rows,'门店TOP20'),'门店排行_'+r.start+'_'+r.end+'.xlsx');ctx.toast('已导出当前日期范围的两个门店排行');
  }
  async function importFile(file){
    if(M.hasPending()){if(lastPreview)showPreview(lastPreview);else ctx.toast('请先通过共享数据管理处理待保存数据');return;}
    try{
      if(file.size>15*1024*1024)throw Error('单次文件不能超过15MB。');
      const wb=root.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true,raw:true}),sheet=wb.Sheets[wb.SheetNames.includes('门店业绩')?'门店业绩':wb.SheetNames[0]];
      if(!sheet||!sheet['!ref'])throw Error('表格没有数据。');
      const bounds=root.XLSX.utils.decode_range(sheet['!ref']);if(bounds.e.r>30000)throw Error('单次最多30000行，请分批导入。');
      for(const [address,cell]of Object.entries(sheet))if(!address.startsWith('!')&&cell.f)throw Error('单元格'+address+'含公式，请先转换为数值。');
      const table=root.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true}),baseRaw=root.localStorage.getItem(M.key),prepared=M.prepare(table);
      lastPreview={table,baseRaw,prepared,name:file.name};showPreview(lastPreview);
    }catch(e){ctx.toast('未导入：'+e.message);}
  }
  function showPreview(preview){
    if(root.document.getElementById('storeRankDialog'))return;
    const dialog=root.document.createElement('dialog');dialog.id='storeRankDialog';dialog.className='rank-import-dialog';dialog.setAttribute('aria-label','门店数据导入预览');
    let saving=false;
    const close=()=>{if(saving)return;dialog.close();dialog.remove();if(!M.hasPending())lastPreview=null;ctx.render();};
    function paint(){
      const p=preview.prepared,s=p.summary;
      dialog.innerHTML=`<div class="dialog-head"><div><span class="rank-overline">STORE DATA IMPORT</span><h2>门店数据导入预览</h2></div><button class="icon-button" data-rank-close aria-label="关闭门店导入">×</button></div><div class="rank-import-body"><p class="rank-source-file">${esc(preview.name)}</p><div class="rank-import-summary"><div><strong>${s.rows}</strong><span>门店日期行</span></div><div><strong>${s.stores}</strong><span>涉及门店</span></div><div><strong>${s.newStores}</strong><span>新增门店</span></div><div><strong>${s.changedValues}</strong><span>更新金额</span></div></div><p class="rank-import-range">日期 ${esc(s.start)} — ${esc(s.end)}。空白保留、0写入；仅更新独立门店排行。</p><div class="rank-preview-scroll"><table><thead><tr><th>日期</th><th>门店</th><th>小程序实收</th><th>储值实收</th></tr></thead><tbody>${p.updates.slice(0,12).map(row=>`<tr><td>${row.date}</td><td>${esc(row.name)}${row.code?'<small>'+esc(row.code)+'</small>':''}</td><td>${Object.hasOwn(row.values,'mini')?esc(cash(row.values.mini)):'保留'}</td><td>${Object.hasOwn(row.values,'recharge')?esc(cash(row.values.recharge)):'保留'}</td></tr>`).join('')}</tbody></table></div><p class="rank-import-hint">${s.rows>12?'预览前12行，共'+s.rows+'行。':''}确认后保存到共享主机；原有两个业绩看板及其他业务数据保持独立。</p><p class="rank-dialog-error" role="alert" hidden></p><div class="rank-recovery" hidden><button class="outline" data-rank-draft>导出待导入数据</button><button class="outline" data-rank-reload>加载主机并重新预览</button></div></div><div class="dialog-foot"><button class="outline" data-rank-close>取消</button><button class="primary" data-rank-confirm>确认导入</button></div>`;
      dialog.querySelectorAll('[data-rank-close]').forEach(b=>b.onclick=close);
      dialog.querySelector('[data-rank-draft]').onclick=()=>root.XLSX.writeFile(book(preview.table,'门店业绩'),'门店待导入数据.xlsx');
      dialog.querySelector('[data-rank-reload]').onclick=async()=>{
        if(!root.confirm('加载主机数据会放弃页面待保存的修改，导入文件内容会保留并重新预览。建议先导出待导入数据。继续？'))return;
        try{await root.__reloadSharedStorage();M.discardPending();preview.baseRaw=root.localStorage.getItem(M.key);preview.prepared=M.prepare(preview.table);paint();}catch(e){error(e.message);}
      };
      dialog.querySelector('[data-rank-confirm]').onclick=async()=>{
        if(saving)return;saving=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);dialog.querySelector('[data-rank-confirm]').textContent='正在保存…';
        try{await M.apply(preview.prepared,preview.baseRaw);saving=false;lastPreview=null;close();ctx.toast('已导入'+s.rows+'行门店数据，并保存到主机');}
        catch(e){saving=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);const conflict=e.code==='CONFLICT'||root.__getSharedStorageStatus?.().state==='conflict';dialog.querySelector('[data-rank-confirm]').textContent=conflict?'请重新预览':'重试保存';dialog.querySelector('[data-rank-confirm]').disabled=conflict;error(e.message);dialog.querySelector('.rank-recovery').hidden=false;}
      };
    }
    const error=message=>{const box=dialog.querySelector('.rank-dialog-error');box.textContent=message;box.hidden=false;};
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});paint();root.document.body.append(dialog);dialog.showModal();
  }
  function bind(options){ctx=options;if(bind.done)return;bind.done=true;const view=root.document.getElementById('view');
    view.addEventListener('click',e=>{const action=e.target.closest('[data-rank-action]')?.dataset.rankAction;if(!action)return;try{if(action==='template')template();if(action==='import')root.document.getElementById('storeRankImport').click();if(action==='export')exportRank();if(action==='resume'&&lastPreview)showPreview(lastPreview);}catch(e){ctx.toast(e.message);}});
    view.addEventListener('change',e=>{if(e.target.id==='storeRankImport'){if(e.target.files[0])importFile(e.target.files[0]);e.target.value='';}});
  }
  root.StoreRankUI={render,bind};
})(window);
