import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:"export {PortalStore} from './web/store';export {ClientError} from './web/api';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const {PortalStore,ClientError}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
globalThis.location={search:''};
test('polling is deduplicated, and an old response cannot replace a newly selected customer',async()=>{
 let resolveOld,calls=0;
 const transport={demo:false,request(path){calls++;return calls===1?new Promise(resolve=>resolveOld=resolve):Promise.resolve({role:'admin',customer_id:'new-customer',customers:[],leases:[],devices:[]});}};
 const store=new PortalStore(transport);store.patch({selected:'old-customer'});
 const first=store.refresh(),poll=store.refresh();assert.equal(calls,1);
 const change=store.selectCustomer('new-customer');resolveOld({role:'admin',customer_id:'old-customer',customers:[],leases:[]});await Promise.all([first,poll,change]);
 assert.equal(calls,2);assert.equal(store.state.dashboard.customer_id,'new-customer');assert.equal(store.state.selected,'new-customer');
});
test('an expired session clears one-time secrets, network and customer state',()=>{const store=new PortalStore({demo:false,request(){throw Error('unused');}});store.patch({selected:'private-selection',secret:{value:'TEST-EPHEMERAL-VALUE',device:true},network:{ipv4:null,detected:'unavailable',at:1}});store.fail(new ClientError('SESSION_EXPIRED',{},401));assert.equal(store.state.secret,null);assert.equal(store.state.network,null);assert.equal(store.state.selected,'');assert.equal(store.state.notice.code,'SESSION_EXPIRED');});
test('revocation remains removing until the backend confirms processing, not just a UI timer',()=>{const store=new PortalStore({demo:false,request(){throw Error('unused');}});store.patch({dashboard:{server_time:100,synchronization:{state:'ready',updated_at:100}}});assert.equal(store.grantState({id:'revoked',revoked_at:90,removal_pending:true}),'deleting');assert.equal(store.grantState({id:'revoked',revoked_at:90,removal_pending:false}),'revoked');});

test('rapid customer changes drain obsolete replies before displaying the latest selection', async () => {
  const pending = [];
  const store = new PortalStore({demo:false,request(path){return new Promise(resolve=>pending.push({path,resolve}));}});
  store.patch({selected:'initial',dashboard:{role:'admin',customer_id:'initial',customers:[]}});
  const a=store.selectCustomer('first');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pending.length,1);
  const b=store.selectCustomer('latest');
  pending[0].resolve({role:'admin',customer_id:'first',customers:[]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pending.length,2);
  pending[1].resolve({role:'admin',customer_id:'latest',customers:[]});
  await Promise.all([a,b]);assert.equal(store.state.dashboard.customer_id,'latest');
});

test('authorize current network obtains a fresh address instead of trusting a cached detection',async()=>{
 const fixture=(...parts)=>parts.join('.');let calls=0;
 const store=new PortalStore({demo:false,async request(){calls++;return{detected:fixture(11,0,0,2),ipv4:fixture(11,0,0,2)};}});
 store.patch({network:{detected:fixture(11,0,0,1),ipv4:fixture(11,0,0,1),at:1}});
 await store.authorizeCurrent();assert.equal(calls,1);assert.equal(store.state.grantIntent.ip,fixture(11,0,0,2));
});

test('failed polling ages old synchronization and expiry with a monotonic clock',async()=>{
 const original=globalThis.performance;let elapsed=0;globalThis.performance={now:()=>elapsed};
 try{
  const store=new PortalStore({demo:false,async request(){return{role:'customer',server_time:100,synchronization:{state:'ready',updated_at:100}};}});
  await store.refresh();elapsed=95000;store.fail(new ClientError('NETWORK_UNAVAILABLE'));
  assert.equal(store.state.dashboard.synchronization.state,'stale');assert.equal(store.state.dashboard.server_time,195);
  assert.equal(store.grantState({expires_at:150,revoked_at:null,applied:true}),'expired');
  assert.equal(store.grantState({expires_at:300,revoked_at:null,applied:true}),'syncFailed');
  elapsed=105000;store.fail(new ClientError('NETWORK_UNAVAILABLE'));assert.equal(store.state.dashboard.server_time,205);
 }finally{globalThis.performance=original;}
});
