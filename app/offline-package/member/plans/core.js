export const uid=()=>globalThis.crypto?.randomUUID?.()??('plan_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12));
export const TYPES = ['满减活动', '分享活动', '储值方案活动', '套餐活动', '其他活动'];
export const DEFAULT_CHECKS = [
  { id: 'plan', label: '方案确定', done: false },
  { id: 'config', label: '配置完成', done: false },
  { id: 'launch', label: '上线检查', done: false },
];
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  return { start: `${month}-01`, end: `${month}-${new Date(y, m, 0).getDate()}`, days: new Date(y, m, 0).getDate() };
}
export function shiftMonth(month, amount) {
  const [y, m] = month.split('-').map(Number);
  const next = new Date(y, m - 1 + amount, 1);
  return localDate(next).slice(0, 7);
}
export function inMonth(activity, month) {
  const b = monthBounds(month);
  return activity.startDate <= b.end && activity.endDate >= b.start;
}
export function dateStatus(activity, today = localDate()) {
  if (today < activity.startDate) return { key: 'upcoming', text: '未开始' };
  if (today > activity.endDate) return { key: 'ended', text: '已结束' };
  return { key: 'running', text: '进行中' };
}
export function progress(activity) {
  const total = activity.checks.length;
  const done = activity.checks.filter(check => check.done).length;
  return { done, total, percent: total ? Math.round(done / total * 100) : 0 };
}
export function currentStage(activity, today = localDate()) {
  return activity.stages.filter(stage => stage.startDate <= today && stage.endDate >= today).map(stage => stage.name).join(' / ');
}
function fail(message) { throw new Error(message); }
function str(value, label, maximum, required = false) {
  if (typeof value !== 'string') fail(`${label}格式不正确`);
  const result = value.trim();
  if (required && !result) fail(`请填写${label}`);
  if (result.length > maximum) fail(`${label}最多${maximum}个字`);
  return result;
}
function identifier(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail(`${label}格式不正确`);
  return value;
}
function unique(items, label) {
  if (new Set(items.map(item => item.id)).size !== items.length) fail(`${label}不能重复`);
}
export function normalizeActivity(input, uuid, previous = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('活动内容格式不正确');
  const title = str(input.title, '活动名称', 120, true);
  if (!TYPES.includes(input.type)) fail('请选择活动类型');
  if (!isDate(input.startDate) || !isDate(input.endDate)) fail('请填写有效的起止日期（2000—2100年）');
  if (input.endDate < input.startDate) fail('结束日期不能早于开始日期');
  const rawStages = input.stages ?? [];
  if (!Array.isArray(rawStages) || rawStages.length > 24) fail('每场活动最多24个阶段');
  const stages = rawStages.map((stage, index) => {
    if (!stage || typeof stage !== 'object') fail(`第${index + 1}个阶段格式不正确`);
    const name = str(stage.name, `第${index + 1}个阶段名称`, 80, true);
    if (!isDate(stage.startDate) || !isDate(stage.endDate)) fail(`请填写“${name}”的有效起止日期`);
    if (stage.endDate < stage.startDate) fail(`“${name}”的结束日期不能早于开始日期`);
    if (stage.startDate < input.startDate || stage.endDate > input.endDate) fail(`“${name}”须在活动起止日期内`);
    return { id: stage.id ? identifier(stage.id, '阶段标识') : uuid(), name, startDate: stage.startDate, endDate: stage.endDate };
  });
  unique(stages, '阶段标识');
  const rawChecks = input.checks ?? DEFAULT_CHECKS;
  if (!Array.isArray(rawChecks) || rawChecks.length < 1 || rawChecks.length > 12) fail('执行检查须有1—12项');
  const checks = rawChecks.map(check => {
    if (!check || typeof check !== 'object' || typeof check.done !== 'boolean') fail('执行检查格式不正确');
    return { id: identifier(check.id, '检查项标识'), label: str(check.label, '检查项名称', 80, true), done: check.done };
  });
  unique(checks, '检查项标识');
  const rawRefs = input.platformRefs ?? previous?.platformRefs ?? [];
  if (!Array.isArray(rawRefs) || rawRefs.length > 100) fail('平台活动关联格式不正确');
  const platformRefs = rawRefs.map(ref => {
    if (!ref || ref.platform !== 'miniapp') fail('仅支持小程序平台关联');
    const metricFields={};for(const key of ['exposedUsers','claimedUsers','participatedUsers']){const v=ref.metricFields?.[key]??'';if(typeof v!=='string'||v.length>100||v&&!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(v)||['__proto__','constructor','prototype'].includes(v))fail('效果字段标识不正确');metricFields[key]=v;}return {platform:'miniapp',activityId:str(ref.activityId,'平台活动标识',200,true),metricFields};
  });
  if (new Set(platformRefs.map(ref => ref.activityId)).size !== platformRefs.length) fail('平台活动标识不能重复');
  const now = new Date().toISOString();
  return {
    id: previous?.id ?? uuid(), title, type: input.type, startDate: input.startDate, endDate: input.endDate,
    rule: str(input.rule ?? '', '活动规则', 4000), stages, checks, platformRefs,
    revision: previous ? previous.revision + 1 : 1, createdAt: previous?.createdAt ?? now, updatedAt: now,
  };
}
export function normalizeBackup(input, uuid) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.activities)) fail('请选择本看板导出的有效备份文件');
  if (input.activities.length > 5000) fail('备份中的活动数量超过5000场');
  const activities = input.activities.map(item => {
    const id = identifier(item.id, '活动标识');
    const normalized = normalizeActivity(item, uuid);
    const validTimestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
    if (!validTimestamp(item.createdAt) || !validTimestamp(item.updatedAt)) fail('备份中的保存时间格式不正确');
    return { ...normalized, id, revision: Number.isSafeInteger(item.revision) && item.revision > 0 ? item.revision : 1, createdAt: item.createdAt, updatedAt: item.updatedAt };
  });
  unique(activities, '活动标识');
  return { schemaVersion: 1, revision: Number.isSafeInteger(input.revision) && input.revision >= 0 ? input.revision : 0, activities };
}
