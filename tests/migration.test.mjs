const fixtureIP=(...octets)=>octets.join(".");
import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
test('version 1 SQLite migrates additively without changing customer grants',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'proxy-access-migrate-'));let mf;
 const bundle=async entry=>(await build({entryPoints:[entry],bundle:true,format:'esm',external:['cloudflare:*'],write:false})).outputFiles[0].text;
 const options=script=>({...convertV4MiniflareOptions({name:'migration',modules:true,script,compatibilityDate:'2026-11-02',durableObjects:{DB:{className:'AccessDatabase',useSQLite:true}}}),resourcePersistencePath:dir});
 const stub=async()=>{const b=await mf.getBindings();return b.DB.get(b.DB.idFromName('security-group-tcp10800'));};
 try{
  mf=new Miniflare(options(await bundle('tests/fixtures/legacy-worker.ts')));let db=await stub();
  await db.query({sql:"INSERT INTO customers(id,name,max_manual_hours,created_at) VALUES('old','existing customer',168,1000)",values:[]});
  await db.query({sql:`INSERT INTO leases(id,customer_id,ip,expires_at,created_at,updated_at) VALUES('grant','old','${fixtureIP(8,8,8,8)}',9999999999,1000,1000)`,values:[]});
  await mf.dispose();mf=new Miniflare(options(await bundle('src/index.ts')));db=await stub();
  const c=(await db.query({sql:"SELECT * FROM customers WHERE id='old'",values:[]})).results[0];assert.equal(c.name,'existing customer');assert.equal(c.max_manual_hours,168);assert.equal(c.max_manual_days,365);assert.equal(c.tier,'standard');
  const l=(await db.query({sql:"SELECT * FROM leases WHERE id='grant'",values:[]})).results[0];assert.equal(l.expires_at,9999999999);
  assert.deepEqual((await db.query({sql:'SELECT * FROM telemetry_samples',values:[]})).results,[]);
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
