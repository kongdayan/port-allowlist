import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('a configured port reaches health, policy, inventory ownership and customer metadata',async()=>{
 const bundle=await build({entryPoints:['src/index.ts'],bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],external:['cloudflare:*'],write:false});
 const key=randomBytes(32).toString('hex'),hash=createHash('sha256').update(key).digest('hex');
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-11-03',durableObjects:{DB:{className:'AccessDatabase',useSQLite:true}},bindings:{MANAGED_PORT:'9443',BUSINESS_TIME_ZONE:'UTC',OPERATOR_HOSTS:'access.example.com',BRAND:'Example Network',ADMIN_KEY_HASH:hash,AGENT_KEY_HASH:hash}}));
 const call=async(path,method='GET',data,host='access.example.com')=>{const response=await mf.dispatchFetch('https://'+host+path,{method,headers:{Authorization:'Bearer '+key},body:data?JSON.stringify(data):undefined});assert.ok(response.ok);return response.json();};
 try{
  assert.equal((await call('/api/health')).port,9443);
  assert.equal((await call('/api/agent/desired')).port,9443);
  const customer=await call('/api/admin/customers','POST',{name:'Example Team'});
  await call('/api/admin/customers/'+customer.id+'/portal','POST',{hostname:'team.example.com',manage_existing_rules:true});
  const metadata=await call('/api/portal','GET',undefined,'team.example.com');assert.equal(metadata.port,9443);assert.equal(metadata.brand,'Example Network');
  const dashboard=await call('/api/dashboard?customer='+customer.id);assert.equal(dashboard.expiry.time_zone,'UTC');
  const ip=[11,0,0,33].join('.');await call('/api/leases','POST',{customer_id:customer.id,ip,expire_date:dashboard.expiry.default_expire_date});
  const after=await call('/api/dashboard?customer='+customer.id);assert.equal(after.leases[0].expires_at,Date.parse(dashboard.expiry.default_expire_date+'T00:00:00Z')/1000);
  const bindings=await mf.getBindings(),stub=bindings.DB.getByName('security-group-tcp9443');
  const rows=await stub.query({sql:'SELECT port,customer_id FROM port_owners',values:[]});assert.equal(rows.results[0].port,9443);assert.equal(rows.results[0].customer_id,customer.id);
 }finally{await mf.dispose();}
});
