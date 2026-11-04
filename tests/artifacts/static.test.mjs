import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../../dist/static/',import.meta.url);
test('static artifact uses an empty seed and resolves a nested deployment path',async()=>{
  const code=await readFile(new URL('runtime-config.js',root),'utf8');
  const context={window:{},document:{currentScript:{src:'https://example.invalid/suite/runtime-config.js'}},URL};
  vm.runInNewContext(code,context);const config=context.window.DashboardRuntime;
  assert.equal(config.storage,'browser');assert.equal(config.mode,'static');assert.equal(config.basePath,'/suite/');
  const seed=JSON.parse(await readFile(new URL('../../server/initial-state.json',import.meta.url),'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(config.seed)),seed);
  for(const path of ['member/index.html','activity-data/index.html','business-dashboard.html','operations/index.html']) {
    const html=await readFile(new URL(path,root),'utf8');assert.match(html,/runtime-config\.js/);assert.match(html,/browser-storage\.js/);
    assert(!/(?:src|href)="\/(?!\/)/.test(html),'root-relative asset in '+path);
  }
});
test('artifact contains no private runtime files or backend source',async()=>{
  let count=0;
  async function walk(url) {for(const name of await readdir(url)) {
    assert(!/^(?:server|private|uploads|backups|logs|\.git|\.env.*)$/.test(name),name);assert(!/\.(db|sqlite|ps1|zip|log)$|\.(private|local)\.json$/.test(name),name);
    const child=new URL(encodeURIComponent(name),url),info=await stat(child);
    if(info.isDirectory())await walk(new URL(child.href+'/'));else count++;
  }}
  await walk(root);assert(count>30);
});
