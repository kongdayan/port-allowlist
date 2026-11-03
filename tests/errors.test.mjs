import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const fixtureIP=(...parts)=>parts.join('.');
test('wire errors are stable and safe; customer synchronization and deletion confirmation are sanitized',async()=>{
 const bundle=await build({entryPoints:['src/index.ts'],bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],external:['cloudflare:*'],write:false});
 const admin=randomBytes(32).toString('hex'),agent=randomBytes(32).toString('hex'),hash=s=>createHash('sha256').update(s).digest('hex');
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-11-03',durableObjects:{DB:{className:'AccessDatabase',useSQLite:true}},bindings:{MANAGED_PORT:'10800',OPERATOR_HOSTS:'access.example.com',BRAND:'Example Network',ADMIN_KEY_HASH:hash(admin),AGENT_KEY_HASH:hash(agent)}}));
 const call=async(path,{key=admin,host='access.example.com',method='GET',data,headers={},raw}={})=>{const response=await mf.dispatchFetch('https://'+host+path,{method,headers:{...(key?{Authorization:'Bearer '+key}:{}),...headers},body:raw??(data?JSON.stringify(data):undefined)});return{status:response.status,data:await response.json()};};
 try{
  let r=await call('/api/dashboard',{key:null});assert.equal(r.status,401);assert.equal(r.data.code,'LOGIN_REQUIRED');assert.equal(/\p{Script=Han}/u.test(r.data.error),false);
  r=await call('/api/admin/customers',{method:'POST',raw:'{'});assert.equal(r.data.code,'INVALID_JSON');
  r=await call('/api/admin/customers',{method:'POST',data:{name:''}});assert.equal(r.data.code,'INVALID_NAME');
  r=await call('/api/login',{method:'POST',data:{key:admin},headers:{Origin:'https://other.example.com'}});assert.equal(r.status,403);assert.equal(r.data.code,'ORIGIN_REJECTED');
  const c=(await call('/api/admin/customers',{method:'POST',data:{name:'Example Team'}})).data,host='team.example.com';
  await call('/api/admin/customers/'+c.id+'/portal',{method:'POST',data:{hostname:host}});
  r=await call('/api/leases',{key:c.key,host,method:'POST',data:{ip:fixtureIP(10,0,0,1),days:30}});assert.equal(r.status,400);assert.equal(r.data.code,'PUBLIC_IP_REQUIRED');
  r=await call('/api/leases',{key:c.key,host,method:'POST',data:{ip:fixtureIP(11,0,0,1),days:366}});assert.equal(r.data.code,'NUMBER_OUT_OF_RANGE');assert.deepEqual(r.data.params,{min:1,max:365});
  const diagnostic='Untrusted provider diagnostic must remain private';
  const report={managed:[],legacy:[],active:{},traffic_available:false,mode:'apply',error:diagnostic,events:[]};
  await call('/api/agent/report',{key:agent,method:'POST',data:report});
  r=await call('/api/dashboard',{key:c.key,host});assert.equal(r.data.synchronization.state,'error');assert.equal(JSON.stringify(r.data).includes(diagnostic),false);assert.equal(r.data.agent,undefined);
  await call('/api/leases',{key:c.key,host,method:'POST',data:{ip:fixtureIP(11,0,0,1),days:30}});
  const lease=(await call('/api/dashboard',{key:c.key,host})).data.leases[0];
  await call('/api/leases/'+lease.id,{key:c.key,host,method:'DELETE'});
  assert.equal((await call('/api/dashboard',{key:c.key,host})).data.leases[0].removal_pending,true);
  report.error=null;report.last_apply=Math.floor(Date.now()/1000)+1;await call('/api/agent/report',{key:agent,method:'POST',data:report});
  assert.equal((await call('/api/dashboard',{key:c.key,host})).data.leases[0].removal_pending,false);
 }finally{await mf.dispose();}
});
