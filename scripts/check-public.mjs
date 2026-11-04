import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=execFileSync('git',['-c','core.excludesFile=','ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const patterns=[
 ['private-network-address',/\b(?:192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)\b/],
 ['credential-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b/],
 ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['production-activity-id',/\bact_m[a-z0-9]+_[a-z0-9]+\b/],
 ['windows-profile-path',/[A-Z]:[\\/](?:Users|ProgramData|Codex)[\\/]/i],
];
for(const name of files){
 assert(!/(?:^|\/)(?:node_modules|backups|logs|uploads|private|\.local-data)(?:\/|$)|\.(?:db|sqlite|log|zip)$/.test(name),'Private/runtime file: '+name);
 assert(!/(?:^|\/)\.env/.test(name)||name.endsWith('.env.example'),'Environment file: '+name);
 const body=await readFile(new URL('../'+name,import.meta.url),'utf8');
 for(const [label,regex] of patterns)assert(!regex.test(body),label+': '+name);
}
const seed=JSON.parse(await readFile(new URL('../server/initial-state.json',import.meta.url),'utf8'));
for(const [key,text] of Object.entries(seed)){
 const value=JSON.parse(text);
 if(key.startsWith('member_ops_v11_')){assert.deepEqual(value.daily,{});assert.deepEqual(value.activities,[])}
 if(key==='member_ops_core_v112')for(const module of Object.values(value.modules))assert.deepEqual(module.rows,{});
 if(key==='member_ops_plans_v112')assert.deepEqual(value.activities,[]);
 if(key==='activity_data_dashboard_v1'){assert.deepEqual(value.todos,[]);assert.equal(value.branding.logo,null);for(const source of value.activities){assert(source.id.startsWith('source-'));assert.deepEqual(source.data,{});assert.deepEqual(source.events,[])}}
 if(key.startsWith('retail-'))assert(Array.isArray(value)?!value.length:Object.keys(value.stores).length===0);
}
const legacy=await readFile(new URL('../app/offline-package/business-dashboard.html',import.meta.url),'utf8');
assert(legacy.includes('zV=[],BV=Uint8Array'),'Embedded store profiles must stay empty');
assert(legacy.includes('eU={},tU='),'Embedded business summary must stay empty');
const packed=legacy.match(/\btU=`([A-Za-z0-9+/=]+)`,nU=null/);assert(packed);
assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(packed[1],'base64'))),{b:[],p:[]},'Packed business samples must stay empty');
const template=JSON.parse(await readFile(new URL('../operations/public/data/template.json',import.meta.url),'utf8'));
for(const key of ['stores','facts','overviewFacts','targets','capacity','activities','members','dishes'])assert.deepEqual(template[key],[]);
console.log(JSON.stringify({checkedFiles:files.length,emptySeed:true,noEmbeddedBusinessData:true,operationsTemplateEmpty:true}));
