import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('a nondefault IANA business zone reaches a real Worker grant independently of client language',async()=>{
 const bundle=await build({entryPoints:['src/index.ts'],bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],external:['cloudflare:*'],write:false});
 const key=randomBytes(32).toString('hex'),hash=createHash('sha256').update(key).digest('hex');
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-11-03',durableObjects:{DB:{className:'AccessDatabase',useSQLite:true}},bindings:{MANAGED_PORT:'10800',OPERATOR_HOSTS:'access.example.com',BUSINESS_TIME_ZONE:'America/New_York',ADMIN_KEY_HASH:hash,AGENT_KEY_HASH:hash}}));
 const call=async(path,method='GET',data,language='en')=>{const response=await mf.dispatchFetch('https://access.example.com'+path,{method,headers:{Authorization:'Bearer '+key,'Accept-Language':language},body:data?JSON.stringify(data):undefined});assert.ok(response.ok);return response.json();};
 try{
  const customer=await call('/api/admin/customers','POST',{name:'Example Team'});
  const target=new Date();target.setUTCMonth(target.getUTCMonth()+1,15);target.setUTCHours(0,0,0,0);const day=target.toISOString().slice(0,10);
  const offsetText=new Intl.DateTimeFormat('en',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(target).find(p=>p.type==='timeZoneName').value;const offsetHours=Number(offsetText.replace('GMT',''));
  await call('/api/leases','POST',{customer_id:customer.id,ip:[11,0,0,51].join('.'),expire_date:day});
  const en=await call('/api/dashboard?customer='+customer.id),zh=await call('/api/dashboard?customer='+customer.id,'GET',undefined,'zh-CN');
  assert.equal(en.expiry.time_zone,'America/New_York');assert.equal(en.leases[0].expires_at,target.getTime()/1000-offsetHours*3600);assert.equal(zh.leases[0].expires_at,en.leases[0].expires_at);assert.equal(en.leases[0].expiry_kind,'date');
 }finally{await mf.dispose();}
});
