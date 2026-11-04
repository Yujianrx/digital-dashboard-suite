import {cp,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../operations/',import.meta.url));
await access(new URL('../operations/node_modules/vite/bin/vite.js',import.meta.url)).catch(()=>{throw Error('请先运行 npm run setup:operations')});
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','local-board','--base','/operations/'],{cwd,stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
await cp(new URL('../operations/dist/',import.meta.url),new URL('../app/offline-package/operations/',import.meta.url),{recursive:true});
console.log('Built operations screen into the local suite. Build output is ignored by Git.');
