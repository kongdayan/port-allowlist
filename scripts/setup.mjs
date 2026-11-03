import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{'operator-host':{type:'string'},'time-zone':{type:'string'},'client-host':{type:'string'},port:{type:'string'},brand:{type:'string'},worker:{type:'string'}}});
await mkdir('.local',{recursive:true,mode:0o700});await chmod('.local',0o700);
const read=async file=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}};
const save=async(file,data)=>{await writeFile(file,typeof data==='string'?data:JSON.stringify(data,null,2)+'\n',{mode:0o600});await chmod(file,0o600);};
const config=await read('.local/project.json');
const host=s=>{if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(s))throw Error('Expected a hostname without protocol or path');return s;};
if(values['operator-host']){const h=host(values['operator-host']);config.operator_hosts=h;config.domains=[...new Set([h,...(config.domains||[])])];}
if(values['client-host'])config.domains=[...new Set([...(config.domains||[]),host(values['client-host'])])];
if(values.port){const port=Number(values.port);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid TCP port');config.port=port;}
if(values.brand)config.brand=values.brand;
if(values['time-zone']){new Intl.DateTimeFormat('en',{timeZone:values['time-zone']});config.time_zone=values['time-zone'];}
if(values.worker){if(!/^[a-z][a-z0-9-]{0,62}$/.test(values.worker))throw Error('Invalid worker name');config.worker_name=values.worker;}
const credentials=await read('.local/credentials.json');
for(const k of ['admin','agent'])credentials[k] ||= randomBytes(32).toString('base64url');
const hashes=Object.fromEntries(Object.entries(credentials).map(([k,v])=>[k.toUpperCase()+'_KEY_HASH',createHash('sha256').update(v).digest('hex')]));
await save('.local/credentials.json',credentials);await save('.local/worker-secrets.json',hashes);await save('.dev.vars',Object.entries(hashes).map(([k,v])=>k+'='+v).join('\n')+'\n');await save('.local/project.json',config);
console.log('Ready. Credentials: .local/credentials.json (owner only; never printed).');
console.log('Local: npm run dev, then npm run bootstrap in another terminal.');
