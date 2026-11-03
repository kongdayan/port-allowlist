import {readFile,writeFile,chmod,mkdir} from 'node:fs/promises';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{url:{type:'string',default:'http://localhost:8798'},'client-host':{type:'string',default:'client.localhost'},name:{type:'string',default:'Example Team'},quota:{type:'string',default:'100'},'manage-existing':{type:'boolean',default:false}}});
const url=new URL(values.url);if(url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw Error('Expected a bare origin');
if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='localhost'))throw Error('HTTPS required outside local development');
const {admin}=JSON.parse(await readFile('.local/credentials.json','utf8'));
const request=async(path,method,data)=>{const response=await fetch(url.origin+path,{method,redirect:'error',headers:{Authorization:'Bearer '+admin,'Content-Type':'application/json'},body:JSON.stringify(data)});const value=await response.json();if(!response.ok)throw Error('API '+response.status+': '+value.error);return value;};
const file='.local/client.json';let client;
try{client=JSON.parse(await readFile(file,'utf8'));if(client.origin!==url.origin)throw Error('Client file belongs to a different origin; use a separate checkout for another deployment');}catch(e){if(e.code!=='ENOENT')throw e;client=await request('/api/admin/customers','POST',{name:values.name});client.origin=url.origin;await mkdir('.local',{recursive:true,mode:0o700});await writeFile(file,JSON.stringify(client,null,2)+'\n',{mode:0o600});await chmod(file,0o600);}
await request('/api/admin/customers/'+client.id,'PATCH',{max_ips:Number(values.quota),max_devices:10,max_manual_days:365});
await request('/api/admin/customers/'+client.id+'/portal','POST',{hostname:values['client-host'],manage_existing_rules:values['manage-existing']});
console.log('Customer configured. Single login token stored in .local/client.json.');console.log('Client entry: '+url.protocol+'//'+values['client-host']+(url.port?':'+url.port:''));
