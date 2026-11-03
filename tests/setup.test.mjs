import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
test('business-zone setup preserves issued credentials and rejects invalid configuration before writing',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'port-allowlist-setup-')),script=resolve('scripts/setup.mjs');
 try{
  let result=spawnSync(process.execPath,[script,'--time-zone','UTC'],{cwd:directory,encoding:'utf8'});assert.equal(result.status,0);
  const credentials=await readFile(join(directory,'.local/credentials.json'),'utf8');assert.equal(JSON.parse(await readFile(join(directory,'.local/project.json'),'utf8')).time_zone,'UTC');
  result=spawnSync(process.execPath,[script,'--time-zone','Asia/Shanghai'],{cwd:directory,encoding:'utf8'});assert.equal(result.status,0);assert.equal(await readFile(join(directory,'.local/credentials.json'),'utf8'),credentials);
  result=spawnSync(process.execPath,[script,'--time-zone','Invalid/Zone'],{cwd:directory,encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(JSON.parse(await readFile(join(directory,'.local/project.json'),'utf8')).time_zone,'Asia/Shanghai');
  for(const value of Object.values(JSON.parse(credentials)))assert.equal(result.stdout.includes(value)||result.stderr.includes(value),false);
 }finally{await rm(directory,{recursive:true,force:true});}
});
