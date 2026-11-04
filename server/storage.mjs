import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, readFileSync, copyFileSync, existsSync, readdirSync, statSync, unlinkSync} from 'node:fs';
import {join} from 'node:path';

export function fault(status, message, extra = {}) { return Object.assign(new Error(message), {status, ...extra}); }
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function operation(op) {
  if (!object(op) || !['set', 'remove', 'clear'].includes(op.action)) throw fault(400, '不支持的数据操作');
  if (op.action !== 'clear' && (typeof op.key !== 'string' || !op.key.trim() || op.key.length > 1024)) throw fault(400, '数据键不能为空或过长');
  if (op.action === 'set' && typeof op.value !== 'string') throw fault(400, '数据值必须为字符串');
  return op;
}
export class Storage {
  constructor(config) {
    this.config = config;
    mkdirSync(config.dataDir, {recursive:true}); mkdirSync(config.backupDir, {recursive:true});
    this.path = join(config.dataDir, 'dashboard.db');
    this.db = new DatabaseSync(this.path);
    try {
      this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS storage(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS meta(name TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);`);
      const initialized = this.meta('revision') !== undefined;
      this.db.exec('BEGIN IMMEDIATE');
      try {
        if (!initialized) {
          // Existing databases with data are adopted without replacing their records.
          if (!this.db.prepare('SELECT 1 FROM storage LIMIT 1').get()) {
            const seed = JSON.parse(readFileSync(config.seedFile, 'utf8'));
            for (const [key,value] of Object.entries(seed)) this.set(key,value);
          }
          this.setMeta('revision', '1'); this.setMeta('updatedAt', new Date().toISOString());
        }
        this.db.exec('COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    } catch(error) { this.db.close(); throw error; }
  }
  meta(name) { return this.db.prepare('SELECT value FROM meta WHERE name=?').get(name)?.value; }
  setMeta(name,value) { this.db.prepare('INSERT OR REPLACE INTO meta(name,value) VALUES(?,?)').run(name,value); }
  set(key,value) { this.db.prepare('INSERT OR REPLACE INTO storage(key,value) VALUES(?,?)').run(key,value); }
  snapshot() { return {revision:Number(this.meta('revision')), updatedAt:this.meta('updatedAt'), values:Object.fromEntries(this.db.prepare('SELECT key,value FROM storage ORDER BY key').all().map(r=>[r.key,r.value]))}; }
  backup() {
    // DELETE journal mode and synchronous commits make the idle file a complete snapshot.
    // This host owns all writes; backup and transaction are synchronous on one event loop.
    const root = this.config.backupDir;
    copyFileSync(this.path, join(root,'dashboard_previous.db'));
    const daily = join(root,'dashboard_'+new Date().toISOString().slice(0,10)+'.db');
    if (!existsSync(daily)) copyFileSync(this.path,daily);
    for(const name of readdirSync(root)) if (/^dashboard_\d{4}-\d{2}-\d{2}\.db$/.test(name)) {
      const path=join(root,name);
      if(statSync(path).mtimeMs < Date.now()-30*86400000) unlinkSync(path);
    }
  }
  apply(body) {
    if (!object(body) || !Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0) throw fault(400,'缺少有效的数据版本，请重新加载后保存');
    let ops;
    if (body.action === 'batch') {
      if (!Array.isArray(body.operations) || body.operations.length > 10000) throw fault(400,'批量操作格式不正确');
      ops=body.operations.map(operation);
    } else if (body.action === 'import') {
      if (!object(body.values) || !['merge','replace'].includes(body.mode)) throw fault(400,'导入格式不正确');
      ops=Object.entries(body.values).map(([key,value])=>operation({action:'set',key,value}));
      if(body.mode==='replace') ops.unshift({action:'clear'});
    } else ops=[operation(body)];
    const current=Number(this.meta('revision'));
    if(body.baseRevision!==current) throw fault(409,'共享数据已由其他用户更新',{revision:current});
    this.backup();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Check under the write lock as well, protecting against another accidental writer.
      if(Number(this.meta('revision'))!==body.baseRevision) throw fault(409,'共享数据已由其他用户更新',{revision:Number(this.meta('revision'))});
      for(const op of ops) {
        if(op.action==='clear') this.db.exec('DELETE FROM storage');
        else if(op.action==='remove') this.db.prepare('DELETE FROM storage WHERE key=?').run(op.key);
        else this.set(op.key,op.value);
      }
      const result={revision:current+1,updatedAt:new Date().toISOString()};
      this.setMeta('revision',String(result.revision)); this.setMeta('updatedAt',result.updatedAt);
      this.db.exec('COMMIT'); return result;
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
