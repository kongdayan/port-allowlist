import {DurableObject} from 'cloudflare:workers';
import {schema} from '../../src/schema';
export class AccessDatabase extends DurableObject {
 constructor(ctx:DurableObjectState,env:Env){super(ctx,env);ctx.storage.sql.exec(schema);}
 async query(q:{sql:string;values:SqlStorageValue[]}){return {results:this.ctx.storage.sql.exec(q.sql,...q.values).toArray(),meta:{changes:0}};}
}
export default {fetch(){return new Response('legacy fixture');}};
