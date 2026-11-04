import {normalizeActivity,normalizeBackup,uid} from './core.js';
export const PLAN_KEY='member_ops_plans_v112',BACKUP_KEY='member_ops_plan_backups_v112';
const clone=x=>JSON.parse(JSON.stringify(x));
let pending=null,busy=false;
export function discardPending(){pending=null;}
function error(message){throw new Error(message)}
function documentValue(){const raw=localStorage.getItem(PLAN_KEY);if(!raw)return {schemaVersion:1,revision:0,activities:[]};const v=JSON.parse(raw);if(v.schemaVersion!==1||!Number.isSafeInteger(v.revision)||v.revision<0||!Array.isArray(v.activities))error('活动计划格式异常，请从计划备份恢复');return v;}
function backups(){const raw=localStorage.getItem(BACKUP_KEY);const v=raw?JSON.parse(raw):[];if(!Array.isArray(v))error('历史备份格式异常');return v;}
function backupCurrent(doc,reason){const all=backups();all.unshift({id:uid(),time:new Date().toISOString(),reason,document:clone(doc)});return all.slice(0,3);}
async function mutate(signature,prepare){
 if(busy)error('计划正在保存，请稍候');busy=true;
 try{
  await window.__sharedStorageReady;
  if(pending){if(pending.signature!==signature)error('有一笔尚未保存的计划修改，请先重试原操作，或导出修改并核对主机数据');if(window.__getSharedStorageStatus?.().state==='error'&&window.__retrySharedStorage)await window.__retrySharedStorage();else await window.__flushSharedStorage();const result=pending.result;pending=null;return clone(result);}
  const status=window.__getSharedStorageStatus?.();if(['error','conflict'].includes(status?.state))error('主机仍有待保存或冲突数据，请先通过共享数据管理处理');
  const doc=clone(documentValue()),before=clone(doc),prepared=prepare(doc);const next=prepared.document;next.revision=before.revision+1;next.updatedAt=new Date().toISOString();
  const result={...prepared.result,revision:next.revision};pending={signature,result};
  if(prepared.backup)localStorage.setItem(BACKUP_KEY,JSON.stringify(backupCurrent(before,prepared.backup)));
  localStorage.setItem(PLAN_KEY,JSON.stringify(next));await window.__flushSharedStorage();pending=null;return clone(result);
 }catch(e){throw new Error(e.message.includes('尚未保存')?e.message:(pending?'尚未保存到主机：':'')+e.message);}finally{busy=false;}
}
export class ActivityRepository{
 async list(){await window.__sharedStorageReady;return clone(documentValue());}
 create(input){return mutate('create:'+JSON.stringify(input),doc=>{if(doc.activities.length>=5000)error('最多保存5000场活动');const activity=normalizeActivity(input,uid);doc.activities.push(activity);return {document:doc,result:{activity}};});}
 update(id,input){return mutate('update:'+id+':'+JSON.stringify(input),doc=>{const i=doc.activities.findIndex(x=>x.id===id);if(i<0)error('关联计划已移除，请刷新');const old=doc.activities[i];if(input.revision!==old.revision)error('这场计划已被更新，请保留当前修改并重新读取主机记录后核对');const activity=normalizeActivity(input,uid,old);doc.activities[i]=activity;return {document:doc,result:{activity}};});}
 remove(id,revision){return mutate('delete:'+id+':'+revision,doc=>{const old=doc.activities.find(x=>x.id===id);if(!old||old.revision!==revision)error('这场计划已被更新，请刷新后核对');doc.activities=doc.activities.filter(x=>x.id!==id);return {document:doc,result:{id},backup:'删除活动'};});}
 async exportBackup(){await window.__sharedStorageReady;await window.__flushSharedStorage();return {...clone(documentValue()),exportedAt:new Date().toISOString()};}
 restoreBackup(input,expectedRevision){const validated=normalizeBackup(input,uid);return mutate('restore:'+expectedRevision+':'+JSON.stringify(validated),doc=>{if(doc.revision!==expectedRevision)error('计划已被更新，请重新读取并核对后恢复');const restored=clone(validated);return {document:restored,result:{activities:restored.activities},backup:'恢复备份'};});}
 async history(){await window.__sharedStorageReady;return clone(backups());}
}
