(function(root){
  'use strict';
  const D=root.Demo, KEY='member_ops_store_rank_v114';
  const fields=['mini','recharge'], clone=value=>JSON.parse(JSON.stringify(value));
  const blank=v=>v===null||v===undefined||String(v).trim()==='';
  let pending=null, busy=false;
  function fail(message,code){const e=new Error(message);if(code)e.code=code;throw e;}
  function read(){
    const raw=root.localStorage.getItem(KEY);
    if(!raw)return {version:1,unit:'cent',stores:{}};
    let data;try{data=JSON.parse(raw);}catch(_){fail('门店排行数据格式异常，请先从共享备份核对恢复。');}
    if(data.version!==1||data.unit!=='cent'||!data.stores||Array.isArray(data.stores)||typeof data.stores!=='object')fail('门店排行数据格式异常，请先核对共享备份。');
    for(const [id,store] of Object.entries(data.stores)){
      if(!/^(code|name):/.test(id)||!store||store.id!==id||typeof store.name!=='string'||!store.rows||Array.isArray(store.rows))fail('门店排行记录不完整，请核对共享备份。');
      for(const [date,row] of Object.entries(store.rows)){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!row||typeof row!=='object')fail('门店排行日期格式异常。');
        for(const metric of fields)if(Object.hasOwn(row,metric)&&!Number.isSafeInteger(row[metric]))fail('门店排行金额格式异常。');
      }
    }
    return data;
  }
  function money(value){
    if(blank(value))return null;
    if(typeof value==='number'){
      const n=Math.round(value*100);
      if(!Number.isFinite(value)||!Number.isSafeInteger(n)||Math.abs(value*100-n)>0.00001||Math.abs(n)>99999999999999)fail('金额需为最多两位小数，且在允许范围内。');
      return n;
    }
    if(typeof value!=='string')fail('金额不支持公式或对象，请粘贴为数值。');
    let text=value.trim().replace(/^[¥￥]\s*/,'');
    if(!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))fail('金额需为有效数值，最多两位小数，不接受公式。');
    text=text.replaceAll(',','');const negative=text.startsWith('-');if(negative)text=text.slice(1);
    const [whole,decimal='']=text.split('.'),cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
    if(!Number.isSafeInteger(cents)||cents>99999999999999)fail('金额超出允许范围。');
    return negative?-cents:cents;
  }
  function date(value){
    if(Object.prototype.toString.call(value)==='[object Date]')value=D.iso(value);
    const text=String(value??'').trim().replaceAll('/','-');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||D.iso(D.dt(text))!==text||text<'2000-01-01'||text>D.cutoff)fail('日期需为2000年起至今天的有效日期，格式YYYY-MM-DD。');
    return text;
  }
  function text(value,label,max=80){const s=String(value??'').normalize('NFKC').trim();if(!s||s.length>max||/[\x00-\x1f\x7f]/.test(s))fail(label+'不能为空、含控制字符或超过'+max+'个字。');return s;}
  const headers={
    '日期':'date','门店编号':'code','门店名称':'name','门店':'name',
    '小程序实收(元)':'mini','小程序实收':'mini','小程序业绩':'mini',
    '储值实收(元)':'recharge','储值实收':'recharge','储值业绩':'recharge'
  };
  function prepare(table,base=read()){
    if(!Array.isArray(table)||table.length<2)fail('表格没有可导入的数据。');
    if(table.length>30001)fail('单次最多导入30000行。');
    const seenHeaders=new Set(),mapping=table[0].map(h=>{
      const name=String(h??'').replace(/^\uFEFF/,'').normalize('NFKC').trim();if(!name)return null;
      const id=headers[name];if(!id)fail('不识别的列：'+name+'，请使用门店排行模板。');
      if(seenHeaders.has(id))fail('重复的表头：'+name);seenHeaders.add(id);return id;
    });
    if(!seenHeaders.has('date')||!seenHeaders.has('name')||!fields.some(f=>seenHeaders.has(f)))fail('模板需要日期、门店名称及至少一个实收金额列。');
    const parsed=[],byCode=new Map(),codesByName=new Map();
    table.slice(1).forEach((cells,index)=>{
      if(!Array.isArray(cells))fail('第'+(index+2)+'行格式异常。');
      if(cells.slice(mapping.length).some(v=>!blank(v)))fail('第'+(index+2)+'行存在表头之外的数据。');
      const input={};mapping.forEach((id,i)=>{if(id)input[id]=cells[i];});
      if(fields.every(f=>blank(input[f])))return;
      try{
        const row={line:index+2,date:date(input.date),name:text(input.name,'门店名称'),code:blank(input.code)?'':text(input.code,'门店编号',60),values:{}};
        for(const f of fields){const value=money(input[f]);if(value!==null)row.values[f]=value;}
        if(row.code){if(byCode.has(row.code)&&byCode.get(row.code)!==row.name)fail('同一门店编号对应多个名称。');byCode.set(row.code,row.name);if(!codesByName.has(row.name))codesByName.set(row.name,new Set());codesByName.get(row.name).add(row.code);}
        parsed.push(row);
      }catch(e){fail('第'+(index+2)+'行：'+e.message);}
    });
    if(!parsed.length)fail('没有可导入的金额，空白不会覆盖原值。');
    const next=clone(base),seen=new Set(),updates=[],changedStores=new Set();let newStores=0,changedValues=0;
    // Resolve explicit identifiers first, so rows without a code cannot silently
    // select one of multiple stores with the same name.
    for(const row of parsed.filter(r=>r.code)){
      const id='code:'+encodeURIComponent(row.code);if(next.stores[id])continue;
      const matches=Object.values(next.stores).filter(s=>s.name===row.name&&!s.code);
      if(matches.length===1&&codesByName.get(row.name).size===1){const old=matches[0];delete next.stores[old.id];next.stores[id]={...old,id,code:row.code};}
      else{next.stores[id]={id,code:row.code,name:row.name,rows:{}};newStores++;}
    }
    for(const row of parsed){
      let id;
      if(row.code)id='code:'+encodeURIComponent(row.code);
      else{
        const matches=Object.values(next.stores).filter(s=>s.name===row.name);
        if(matches.length>1)fail('第'+row.line+'行：存在同名门店，请填写门店编号。');
        id=matches[0]?.id||'name:'+encodeURIComponent(row.name);
        if(!next.stores[id]){next.stores[id]={id,code:'',name:row.name,rows:{}};newStores++;}
      }
      const unique=id+'|'+row.date;if(seen.has(unique))fail('第'+row.line+'行：门店和日期重复，请合并为一行。');seen.add(unique);
      const store=next.stores[id],previous=store.rows[row.date]||{};store.name=row.name;
      for(const [metric,value]of Object.entries(row.values))if(previous[metric]!==value)changedValues++;
      store.rows[row.date]={...previous,...row.values};changedStores.add(id);updates.push({...row,id});
    }
    if(Object.keys(next.stores).length>5000)fail('最多维护5000家门店。');
    return {next,updates,summary:{rows:updates.length,stores:changedStores.size,newStores,changedValues,start:updates.map(r=>r.date).sort()[0],end:updates.map(r=>r.date).sort().at(-1)}};
  }
  function sum(store,metric,days){let value=0,count=0;for(const day of days){const v=store.rows[day]?.[metric];if(v===undefined)continue;value+=v;count++;if(!Number.isSafeInteger(value))fail('所选范围的金额合计超出允许范围。');}return {value:count?value:null,days:count};}
  function rank(metric,days,previousDays,limit=20){
    if(!fields.includes(metric))fail('排行指标无效。');
    const result=Object.values(read().stores).map(s=>{
      const current=sum(s,metric,days),previous=sum(s,metric,previousDays);
      const diff=current.value!==null&&previous.value!==null?current.value-previous.value:null;
      if(diff!==null&&!Number.isSafeInteger(diff))fail('所选区间的对比差额超出允许范围。');
      return {id:s.id,code:s.code,name:s.name,current:current.value,previous:previous.value,currentDays:current.days,previousDays:previous.days,diff,
        growth:diff===null||previous.value===0&&current.value!==0?null:previous.value===0?0:diff/Math.abs(previous.value)*100};
    }).filter(s=>s.currentDays>0).sort((a,b)=>b.current-a.current||a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id));
    return {total:result.length,rows:result.slice(0,limit).map((r,i)=>({...r,position:i+1}))};
  }
  async function apply(prepared,baseRaw){
    if(busy)fail('门店数据正在保存，请稍候。');busy=true;
    const signature=JSON.stringify(prepared.updates);
    try{
      await root.__sharedStorageReady;
      if(pending){
        if(pending.signature!==signature)fail('请先处理上一笔未保存的门店导入。');
        if(root.localStorage.getItem(KEY)!==pending.raw)fail('待保存的门店数据已变化，请加载主机重新预览。','CONFLICT');
        const status=root.__getSharedStorageStatus?.();if(status?.state==='conflict')fail('主机数据冲突，请导出待导入数据并加载主机重新预览。','CONFLICT');
        if(status?.state==='error')await root.__retrySharedStorage();else await root.__flushSharedStorage?.();
        if(root.localStorage.getItem(KEY)!==pending.raw)fail('待保存的门店数据已变化，请重新预览。','CONFLICT');
        pending=null;return prepared.summary;
      }
      if(['error','conflict'].includes(root.__getSharedStorageStatus?.().state))fail('当前有未保存数据，请先通过共享数据管理处理。');
      if(root.localStorage.getItem(KEY)!==baseRaw)fail('门店数据已更新，请重新预览后再确认。','CONFLICT');
      if(root.__dashboardStorageMode==='shared'){
        const response=await root.fetch('/api/storage',{cache:'no-store'});if(!response.ok)fail('读取主机数据失败，请重试。');
        const snapshot=await response.json();if((snapshot.values?.[KEY]??null)!==baseRaw)fail('门店数据已被其他用户更新，请加载主机重新预览。','CONFLICT');
      }
      const next={...prepared.next,updatedAt:new Date().toISOString()},raw=JSON.stringify(next);pending={signature,raw};
      root.localStorage.setItem(KEY,raw);await root.__flushSharedStorage?.();pending=null;return prepared.summary;
    }catch(e){if(pending&&!String(e.message).includes('尚未保存'))e.message='尚未保存到主机：'+e.message;throw e;}
    finally{busy=false;}
  }
  root.StoreRankModel={key:KEY,read,money,prepare,rank,apply,discardPending(){pending=null;},hasPending(){return !!pending;}};
})(window);
