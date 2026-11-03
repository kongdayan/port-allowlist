import { env } from 'cloudflare:workers';
import { publicIPv4, covers, integer } from './policy';
import { download } from './scripts';
import { expiry, dateAfter, localDay, midnight } from './expiry';
import { controlSchema } from './control-schema';
import { operatorHosts, portalHostname, PORT, BRAND, BUSINESS_TIME_ZONE, type ClientPortal } from './portal';
import { sampleView, type Agent, type Traffic } from './telemetry';
import { AccessDatabase, Database, Statement } from './storage';
export { AccessDatabase } from './storage';

type Principal = { role: 'admin' | 'customer' | 'device'; customer: string | null; device: string | null; key: string };
type Customer = { id: string; name: string; enabled: number; max_devices: number; max_ips: number; lease_minutes: number; grace_seconds: number; max_manual_hours: number; max_manual_days: number; tier: string };
type Lease = { id: string; customer_id: string; device_id: string | null; ip: string; label: string; previous_ip: string | null; previous_until: number | null; expires_at: number; revoked_at: number | null };
import { PublicError as Failure, errorMessages } from '../shared/errors';
const now = () => Math.floor(Date.now() / 1000);
const id = () => crypto.randomUUID();
const db = () => new Database((env.DB as DurableObjectNamespace<AccessDatabase>).getByName(`security-group-tcp${PORT}`));
const LIVE_SQL = ` FROM leases l JOIN customers c ON c.id=l.customer_id LEFT JOIN devices d ON d.id=l.device_id WHERE c.enabled=1 AND l.revoked_at IS NULL AND l.expires_at>strftime('%s','now') AND (l.device_id IS NULL OR d.enabled=1)`;
const ACTIVE_IPS_SQL = `SELECT l.ip${LIVE_SQL} UNION SELECT l.previous_ip${LIVE_SQL} AND l.previous_ip IS NOT NULL AND l.previous_until>strftime('%s','now')`;
const LEGACY_USAGE_SQL = `(SELECT count(*) FROM cloud_rules WHERE present=1 AND delete_requested_at IS NULL AND EXISTS(SELECT 1 FROM port_owners WHERE port=${PORT} AND customer_id=?))`;
const CAPACITY_SQL = `(? IN (${ACTIVE_IPS_SQL}) OR (SELECT count(*) FROM (${ACTIVE_IPS_SQL}))<180)`;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
async function hash(value: string) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); }
const hex = (value: Uint8Array) => Array.from(value, b => b.toString(16).padStart(2, '0')).join('');
async function hashed(value: string) { return hex(await hash(value)); }
async function matches(value: string, expected: string) {
  const bytes = /^[a-f0-9]{64}$/.test(expected || '') ? Uint8Array.from(expected.match(/../g)!, x => parseInt(x, 16)) : new Uint8Array(32);
  return crypto.subtle.timingSafeEqual(await hash(value), bytes) && !!expected;
}
function token(kind: string) { return `pa_${kind}_${btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`; }
async function body(request: Request, limit = 16384): Promise<Record<string, unknown>> {
  if (!request.body) return {};
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > limit) { await reader.cancel(); throw new Failure(413, 'REQUEST_TOO_LARGE'); } chunks.push(item.value); }
  const all = new Uint8Array(size); let at = 0; for (const c of chunks) { all.set(c, at); at += c.length; }
  try { const data: unknown = size ? JSON.parse(new TextDecoder().decode(all)) : {}; if (!data || typeof data !== 'object' || Array.isArray(data)) throw 0; return data as Record<string, unknown>; }
  catch { throw new Failure(400, 'INVALID_JSON'); }
}
function label(value: unknown, fallback = '') { const s = typeof value === 'string' ? value.trim() : fallback; if (!s || s.length > 80) throw new Failure(400, 'INVALID_NAME'); return s; }
async function rate(key: string, max: number) {
  const t = now(), bucket = `${key}:${Math.floor(t / 60)}`;
  const result = await db().prepare('INSERT INTO rate_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(bucket, t + 120).first<{ count: number }>();
  if (!result || result.count > max) throw new Failure(429, 'RATE_LIMITED');
}
async function keyPrincipal(key: string): Promise<Principal> {
  if (await matches(key, env.ADMIN_KEY_HASH)) return { role: 'admin', customer: null, device: null, key: `admin:${env.ADMIN_KEY_HASH}` };
  const row = await db().prepare(`SELECT k.id,k.kind,k.customer_id,k.device_id FROM api_keys k JOIN customers c ON c.id=k.customer_id
    LEFT JOIN devices d ON d.id=k.device_id WHERE k.token_hash=? AND k.revoked_at IS NULL AND c.enabled=1 AND (k.device_id IS NULL OR d.enabled=1)`).bind(await hashed(key)).first<{ id: string; kind: 'customer' | 'device'; customer_id: string; device_id: string | null }>();
  if (!row) throw new Failure(401, 'INVALID_CREDENTIAL');
  return { role: row.kind, customer: row.customer_id, device: row.device_id, key: row.id };
}
async function principal(request: Request): Promise<Principal> {
  const bearer = request.headers.get('Authorization');
  if (bearer?.startsWith('Bearer ')) { const p = await keyPrincipal(bearer.slice(7)); await rate(`key:${p.key}`, 60); return p; }
  const session = /(?:^|;\s*)__Host-pa_session=([^;]+)/.exec(request.headers.get('Cookie') || '')?.[1];
  if (!session) throw new Failure(401, 'LOGIN_REQUIRED');
  const row = await db().prepare('SELECT key_id FROM sessions WHERE token_hash=? AND expires_at>?').bind(await hashed(session), now()).first<{ key_id: string }>();
  if (!row) throw new Failure(401, 'SESSION_EXPIRED');
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== new URL(request.url).origin) throw new Failure(403, 'ORIGIN_REJECTED');
  await rate(`session:${row.key_id}`, 60);
  if (row.key_id === `admin:${env.ADMIN_KEY_HASH}`) return { role: 'admin', customer: null, device: null, key: row.key_id };
  const k = await db().prepare(`SELECT k.id,k.customer_id FROM api_keys k JOIN customers c ON c.id=k.customer_id WHERE k.id=? AND k.kind='customer' AND k.revoked_at IS NULL AND c.enabled=1`).bind(row.key_id).first<{ id: string; customer_id: string }>();
  if (!k) throw new Failure(401, 'ACCESS_REVOKED');
  return { role: 'customer', customer: k.customer_id, device: null, key: k.id };
}
function admin(p: Principal) { if (p.role !== 'admin') throw new Failure(403, 'ADMIN_REQUIRED'); }
function portal(p: Principal) { if (p.role === 'device') throw new Failure(403, 'DEVICE_SCOPE_ONLY'); }
function customerId(p: Principal, value: string | null) { const c = p.role === 'admin' ? value : p.customer; if (!c) throw new Failure(400, 'CUSTOMER_REQUIRED'); return c; }
async function customer(cid: string) { const c = await db().prepare('SELECT * FROM customers WHERE id=?').bind(cid).first<Customer>(); if (!c) throw new Failure(404, 'CUSTOMER_NOT_FOUND'); return c; }
async function audit(cid: string | null, action: string, ip: string | null, detail: string) { await db().prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').bind(id(), cid, action, ip, detail, now()).run(); }
async function state() { const r = await db().prepare("SELECT payload,updated_at FROM agent_state WHERE id='primary'").first<{ payload: string; updated_at: number }>(); return r ? { ...JSON.parse(r.payload) as Agent, updated_at: r.updated_at } : { managed: [], legacy: [], active: {}, error: null, mode: 'unknown', updated_at: 0 } as Agent & { updated_at: number }; }
async function activeLeases(cid: string | null): Promise<Lease[]> {
  return (await db().prepare(`SELECT l.* FROM leases l JOIN customers c ON c.id=l.customer_id LEFT JOIN devices d ON d.id=l.device_id
    WHERE c.enabled=1 AND l.revoked_at IS NULL AND l.expires_at>? AND (l.device_id IS NULL OR d.enabled=1) ${cid ? 'AND l.customer_id=?' : ''} ORDER BY l.updated_at DESC`).bind(...(cid ? [now(), cid] : [now()])).all<Lease>()).results;
}
async function portalForHost(hostname: string): Promise<ClientPortal | null> {
  if (operatorHosts.has(hostname)) return null;
  const row=await db().prepare('SELECT p.hostname,p.customer_id,c.name FROM client_portals p JOIN customers c ON c.id=p.customer_id WHERE p.hostname=? AND c.enabled=1').bind(hostname).first<ClientPortal>();
  if (!row) throw new Failure(404,'PORTAL_UNAVAILABLE');
  return row;
}
function scoped(p: Principal, portal: ClientPortal | null) {
  if (portal && (p.role==='admin' || p.customer!==portal.customer_id)) throw new Failure(403,'PORTAL_TOKEN_MISMATCH');
  if (!portal && p.role==='customer') throw new Failure(403,'CUSTOMER_PORTAL_REQUIRED');
}
async function dashboard(p: Principal, selected: string | null) {
  portal(p); const cid = p.role === 'admin' ? selected : p.customer;
  const scopedIps = `SELECT l.ip${LIVE_SQL} AND l.customer_id=? UNION SELECT l.previous_ip${LIVE_SQL} AND l.customer_id=? AND l.previous_ip IS NOT NULL AND l.previous_until>strftime('%s','now')`;
  const rows = await db().batch([
    p.role==='admin' ? db().prepare('SELECT * FROM customers ORDER BY created_at DESC LIMIT 500') : db().prepare('SELECT * FROM customers WHERE id=?').bind(cid),
    db().prepare('SELECT * FROM leases WHERE customer_id=? ORDER BY updated_at DESC LIMIT 300').bind(cid),
    db().prepare('SELECT id,name,enabled,last_seen,created_at FROM devices WHERE customer_id=? ORDER BY created_at DESC').bind(cid),
    db().prepare("SELECT payload,updated_at FROM agent_state WHERE id='primary'"),
    db().prepare(`SELECT l.*${LIVE_SQL} ${cid?'AND l.customer_id=?':''} ORDER BY l.updated_at DESC`).bind(...(cid?[cid]:[])),
    db().prepare('SELECT * FROM access_events ORDER BY at DESC LIMIT 300'),
    db().prepare(`SELECT action,ip,detail,created_at FROM audit ${cid?'WHERE customer_id=?':''} ${p.role==='customer'?"AND action IN ('ip.added','ip.revoked','ip.renewed','ip.cloud_deleted','device.created','device.revoked')":''} ORDER BY created_at DESC LIMIT 60`).bind(...(cid?[cid]:[])),
    db().prepare('SELECT at,payload FROM telemetry_samples WHERE at>=? ORDER BY at').bind(now()-3600),
  ]);
  const customers=rows[0].results as Customer[], leases=rows[1].results as Lease[], devices=rows[2].results;
  const stored=rows[3].results[0];
  const a:Agent & {updated_at:number}=stored?{...JSON.parse(String(stored.payload)),updated_at:Number(stored.updated_at)}:{managed:[],legacy:[],active:{},error:null,mode:'unknown',updated_at:0};
  const live=rows[4].results as Lease[], eventRows=rows[5].results, logs=rows[6].results, samples=rows[7].results as {at:number;payload:string}[];
  const ips = new Set(live.flatMap(l => [l.ip, ...(l.previous_ip && (l.previous_until || 0) > now() ? [l.previous_ip] : [])]));
  const firewallRules=(await db().prepare(`SELECT ref,cidr,delete_requested_at FROM cloud_rules WHERE present=1 AND EXISTS(SELECT 1 FROM port_owners WHERE port=${PORT} ${cid?'AND customer_id=?':''}) ORDER BY cidr`).bind(...(cid?[cid]:[])).all()).results;
  const networks=firewallRules.map(r=>String(r.cidr));
  const permitted=(ip:string)=>ips.has(ip)||networks.some(net=>covers(net,ip));
  const allowed = p.role === 'admin' ? null : ips;
  const history = samples.map(r => sampleView(JSON.parse(r.payload) as Agent, allowed, r.at, networks));
  const current = sampleView(a, allowed, a.updated_at, networks);
  const events=eventRows.filter(e=>p.role==='admin'||permitted(String(e.ip))).slice(0,60);
  const picked = customers.find(c => c.id === cid), maxDays = picked?.max_manual_days || 365;
  const traffic = Object.fromEntries(Object.entries(a.traffic || {}).filter(([ip]) => !allowed || permitted(ip)));
  const publicLeases = leases.map(l => ({ ...l, removal_pending: !!l.revoked_at && !(a.mode==='apply'&&!a.error&&(a.last_apply||0)>l.revoked_at), expire_date: l.device_id ? null : localDay(l.expires_at,BUSINESS_TIME_ZONE), expiry_kind: l.device_id ? 'automatic' : midnight(localDay(l.expires_at,BUSINESS_TIME_ZONE),BUSINESS_TIME_ZONE)===l.expires_at ? 'date' : 'legacy_hours', applied: live.some(active => active.id === l.id) && now() - a.updated_at < 90 && !a.error && a.mode === 'apply' && [...a.managed, ...a.legacy].some(net => covers(net, l.ip)) }));
  const sync = { state: !a.updated_at ? 'unavailable' : now()-a.updated_at>=90 ? 'stale' : a.error ? 'error' : a.mode==='apply' ? 'ready' : 'dry_run', updated_at: a.updated_at, last_reconciled_at: a.last_apply || 0 };
  const common = { synchronization: sync, port: PORT, devices, firewall_rules:firewallRules, leases: p.role==='admin'?publicLeases:publicLeases.map(({customer_id,...l})=>l),
    server_time: now(), expiry: { time_zone: BUSINESS_TIME_ZONE, today: localDay(now(),BUSINESS_TIME_ZONE), default_days: Math.min(30,maxDays), default_expire_date: dateAfter(now(),Math.min(30,maxDays),BUSINESS_TIME_ZONE), max_expire_date: dateAfter(now(),maxDays,BUSINESS_TIME_ZONE) }, monitor: { current, history, traffic },
    events, audit: logs };
  const active=Object.fromEntries(Object.entries(a.active).filter(([ip])=>p.role==='admin'||permitted(ip)));
  if (p.role==='admin') return json({...common,role:'admin',customer_id:cid,customers,agent:{updated_at:a.updated_at,error:a.error,mode:a.mode,active,legacy:a.legacy,managed:a.managed}});
  const c=picked!;
  return json({...common,role:'customer',account:{name:c.name,max_ips:c.max_ips,max_devices:c.max_devices,max_manual_days:c.max_manual_days,lease_minutes:c.lease_minutes,grace_seconds:c.grace_seconds},service:{updated_at:a.updated_at,available:now()-a.updated_at<90&&!a.error&&a.mode==='apply',active}});
}
async function agent(request: Request, path: string) {
  const key = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  if (!await matches(key, env.AGENT_KEY_HASH)) throw new Failure(401, 'INVALID_AGENT_CREDENTIAL');
  await rate('agent', 180);
  if (request.method === 'GET' && path === '/api/agent/desired') {
    const rows = await activeLeases(null), desired = new Map<string, number>();
    for (const l of rows) { desired.set(l.ip, Math.max(desired.get(l.ip) || 0, l.expires_at)); if (l.previous_ip && (l.previous_until || 0) > now()) desired.set(l.previous_ip, Math.max(desired.get(l.previous_ip) || 0, l.previous_until!)); }
    if (desired.size > 180) throw new Failure(409, 'DEPLOYMENT_CAPACITY_REACHED');
    const entries = [...desired].sort(([a], [b]) => a.localeCompare(b)).map(([ip, expires_at]) => ({ ip, expires_at }));
    const deletionRows=(await db().prepare(`SELECT ref FROM cloud_rules WHERE present=1 AND delete_requested_at IS NOT NULL AND EXISTS(SELECT 1 FROM port_owners WHERE port=${PORT})`).all<{ref:string}>()).results;
    return json({ port: PORT, issued_at: now(), entries, delete_legacy:deletionRows.map(r=>r.ref), digest: await hashed(JSON.stringify(entries)) });
  }
  if (request.method === 'POST' && path === '/api/agent/report') {
    const data = await body(request, 131072); const cidrs = (x: unknown) => { if (!Array.isArray(x) || x.length > 1000 || x.some(v => typeof v !== 'string' || !/^\d+\.\d+\.\d+\.\d+\/\d{1,2}$/.test(v))) throw new Failure(400, 'INVALID_INVENTORY'); return x as string[]; };
    const active: Record<string, number> = {}; if (data.active && typeof data.active === 'object') for (const [ip, count] of Object.entries(data.active)) { try { active[publicIPv4(ip)] = integer(count, 0, 100000, 0); } catch { /* Ignore private/internal peers. */ } }
    const traffic: Traffic = {};
    if (data.traffic && typeof data.traffic === 'object' && !Array.isArray(data.traffic)) for (const [ip,value] of Object.entries(data.traffic).slice(0,200)) {
      if (!value || typeof value !== 'object') continue;
      const v=value as Record<string,unknown>, up=Number(v.up_bps), down=Number(v.down_bps);
      try { const address=publicIPv4(ip); if (Number.isFinite(up) && Number.isFinite(down) && up>=0 && down>=0 && up<=1e12 && down<=1e12) traffic[address]={up_bps:up,down_bps:down}; } catch { /* Invalid peer telemetry is ignored. */ }
    }
    const payload = { traffic, traffic_available: data.traffic_available === true, traffic_limited: data.traffic_limited === true, managed: cidrs(data.managed), legacy: cidrs(data.legacy), active, error: typeof data.error === 'string' ? data.error.slice(0, 100) : null, mode: data.mode === 'apply' ? 'apply' : 'dry-run', last_apply: data.last_apply };

    const events = Array.isArray(data.events) ? data.events.slice(0, 40) : [];
    const sample = { active: payload.active, traffic, traffic_available: payload.traffic_available, traffic_limited: payload.traffic_limited, mode: payload.mode, error: payload.error };
    const queries: Statement[] = [
      db().prepare("INSERT INTO agent_state VALUES('primary',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(JSON.stringify(payload), now()),
      db().prepare('INSERT INTO telemetry_samples(at,payload) VALUES(?,?) ON CONFLICT(at) DO NOTHING').bind(Math.floor(now()/60)*60,JSON.stringify(sample)),
    ];
    for (const e of events) {
      if (!e || typeof e !== 'object') continue;
      const v = e as Record<string, unknown>;
      try { const ip = publicIPv4(v.ip); if (typeof v.id !== 'string' || v.id.length > 128) continue; queries.push(db().prepare('INSERT OR IGNORE INTO access_events VALUES(?,?,?,?,?,?,?)').bind(v.id, ip, integer(v.at, now() - 7 * 86400, now() + 60, now()), integer(v.bytes_up, 0, Number.MAX_SAFE_INTEGER, 0), integer(v.bytes_down, 0, Number.MAX_SAFE_INTEGER, 0), Number(v.duration) || 0, String(v.status || '').slice(0, 8))); } catch { /* Invalid telemetry cannot change policy. */ }
    }
    if (Array.isArray(data.existing_rules)) {
      if (data.existing_rules.length>250) throw new Failure(400,'INVENTORY_TOO_LARGE');
      const inventory=data.existing_rules as {ref:unknown;cidr:unknown}[];
      if (inventory.some(r=>!r||typeof r.ref!=='string'||!/^([a-f0-9]{64})$/.test(r.ref)||typeof r.cidr!=='string'||!/^\d+\.\d+\.\d+\.\d+\/\d{1,2}$/.test(r.cidr))) throw new Failure(400,'INVALID_INVENTORY');
      queries.push(db().prepare('UPDATE cloud_rules SET present=0'));
      for (const r of inventory) queries.push(db().prepare('INSERT INTO cloud_rules(ref,cidr,present,seen_at) VALUES(?,?,1,?) ON CONFLICT(ref) DO UPDATE SET cidr=excluded.cidr,present=1,seen_at=excluded.seen_at').bind(String(r.ref),String(r.cidr),now()));
      queries.push(db().prepare('UPDATE cloud_rules SET deleted_at=? WHERE present=0 AND delete_requested_at IS NOT NULL AND deleted_at IS NULL').bind(now()));
    }
    if (queries.length) await db().batch(queries);

    return json({ ok: true });
  }
  throw new Failure(404, 'NOT_FOUND');
}
async function handle(request: Request): Promise<Response> {
  const u = new URL(request.url), path = u.pathname;
  if (path === '/api/health') return json({ ok: true, port: PORT });
  const boundPortal=await portalForHost(u.hostname);
  if (path==='/api/portal' && request.method==='GET') return json(boundPortal?{mode:'customer',name:boundPortal.name,brand:BRAND,service:'Network Access',port:PORT}:{mode:'operator',name:BRAND,brand:BRAND,service:'Network Operations',port:PORT});
  if (boundPortal && (path.startsWith('/api/admin/')||path.startsWith('/api/agent/'))) throw new Failure(404,'NOT_FOUND');
  if (path.startsWith('/downloads/')) return download(request);
  if (path.startsWith('/api/agent/')) return agent(request, path);
  if (request.method === 'POST' && path === '/api/login') {
    if (request.headers.has('Origin') && request.headers.get('Origin') !== u.origin) throw new Failure(403, 'ORIGIN_REJECTED');
    await rate(`login:${request.headers.get('CF-Connecting-IP') || 'unknown'}`, 12);
    const data = await body(request), p = await keyPrincipal(typeof data.key === 'string' ? data.key : ''); portal(p); scoped(p,boundPortal);
    const secret = token('session'); await db().prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hashed(secret), p.key, now() + 8 * 3600).run();
    const response = json({ role: p.role }); response.headers.set('Set-Cookie', `__Host-pa_session=${secret}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`); return response;
  }
  const p = await principal(request); scoped(p,boundPortal);
  if (request.method === 'POST' && path === '/api/logout') { const session = /(?:^|;\s*)__Host-pa_session=([^;]+)/.exec(request.headers.get('Cookie') || '')?.[1]; if (session) await db().prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hashed(session)).run(); const response = json({ ok: true }); response.headers.set('Set-Cookie', '__Host-pa_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'); return response; }
  if (request.method==='POST'&&path==='/api/admin/maintenance/migrate') {
    admin(p); await db().batch(controlSchema.map(sql=>db().prepare(sql)));return json({ok:true,version:3});
  }
  if (request.method === 'GET' && path === '/api/dashboard') return dashboard(p, u.searchParams.get('customer'));
  if (request.method === 'GET' && path === '/api/ip') { portal(p); const raw = request.headers.get('CF-Connecting-IP') || ''; let ip: string | null = null; try { ip = publicIPv4(raw); } catch { /* IPv6 requires IPv4 script. */ } return json({ detected: raw, ipv4: ip }); }
  if (request.method === 'POST' && path === '/api/device/refresh') {
    if (p.role !== 'device' || !p.device) throw new Failure(403, 'DEVICE_TOKEN_REQUIRED');
    const ip = publicIPv4(request.headers.get('CF-Connecting-IP')), c = await customer(p.customer!), t = now(), leaseId = id();
    const result = await db().prepare(`INSERT INTO leases(id,customer_id,device_id,ip,label,expires_at,created_at,updated_at)
      SELECT ?,?,?,?,'Automatic update',?,?,? WHERE (SELECT COUNT(*) FROM leases WHERE customer_id=? AND revoked_at IS NULL AND expires_at>? AND (device_id IS NULL OR device_id<>?))+${LEGACY_USAGE_SQL}<(SELECT max_ips FROM customers WHERE id=?)
      AND ${CAPACITY_SQL}
      ON CONFLICT(device_id) DO UPDATE SET previous_ip=CASE WHEN leases.ip<>excluded.ip AND leases.expires_at>? AND leases.revoked_at IS NULL THEN leases.ip ELSE CASE WHEN leases.ip=excluded.ip THEN leases.previous_ip ELSE NULL END END,
      previous_until=CASE WHEN leases.ip<>excluded.ip AND leases.expires_at>? AND leases.revoked_at IS NULL THEN ? ELSE CASE WHEN leases.ip=excluded.ip THEN leases.previous_until ELSE NULL END END,
      ip=excluded.ip,expires_at=excluded.expires_at,revoked_at=NULL,updated_at=excluded.updated_at`).bind(leaseId, c.id, p.device, ip, t + c.lease_minutes * 60, t, t, c.id, t, p.device, c.id, c.id, ip, t, t, t + c.grace_seconds).run();
    if (!result.meta.changes) throw new Failure(409, 'AUTHORIZATION_LIMIT_REACHED');
    await db().prepare('UPDATE devices SET last_seen=? WHERE id=?').bind(t, p.device).run();
    const a = await state(); const applied = now() - a.updated_at < 90 && !a.error && a.mode === 'apply' && [...a.managed, ...a.legacy].some(cidr => covers(cidr, ip));
    return json({ ip, expires_at: t + c.lease_minutes * 60, state: applied ? 'applied' : 'pending', note_code: 'FIREWALL_SYNC_ONLY', note: 'Applied confirms firewall synchronization only. Test a new service connection separately.' });
  }
  portal(p);
  if (request.method === 'POST' && path === '/api/admin/customers') {
    admin(p); const data = await body(request), cid = id(), secret = token('customer');
    await db().batch([
      db().prepare('INSERT INTO customers(id,name,created_at) VALUES(?,?,?)').bind(cid, label(data.name), now()),
      db().prepare("INSERT INTO api_keys(id,token_hash,kind,customer_id,created_at) VALUES(?,?,'customer',?,?)").bind(id(), await hashed(secret), cid, now()),
    ]); await audit(cid, 'customer.created', null, '创建客户'); return json({ id: cid, key: secret }, 201);
  }
  const rotation = /^\/api\/admin\/customers\/([\w-]+)\/key$/.exec(path);
  if (request.method === 'POST' && rotation) {
    admin(p); const c = await customer(rotation[1]), data=await body(request), secret = data.token===undefined?token('customer'):data.token;
    if (typeof secret!=='string'||secret.length<8||secret.length>128||/[\x00-\x1f\x7f]/.test(secret)) throw new Failure(400,'INVALID_TOKEN_LENGTH');
    if (await matches(secret,env.ADMIN_KEY_HASH)||await matches(secret,env.AGENT_KEY_HASH)) throw new Failure(409,'TOKEN_REUSE_FORBIDDEN');
    const tokenHash=await hashed(secret), existing=await db().prepare('SELECT customer_id,kind FROM api_keys WHERE token_hash=?').bind(tokenHash).first<{customer_id:string;kind:string}>();
    if (existing&&(existing.customer_id!==c.id||existing.kind!=='customer')) throw new Failure(409,'TOKEN_ALREADY_ASSIGNED');
    await db().batch([
      db().prepare("DELETE FROM sessions WHERE key_id IN (SELECT id FROM api_keys WHERE customer_id=? AND kind='customer')").bind(c.id),
      db().prepare("UPDATE api_keys SET revoked_at=? WHERE customer_id=? AND kind='customer'").bind(now(), c.id),
      db().prepare("INSERT INTO api_keys(id,token_hash,kind,customer_id,created_at) VALUES(?,?,'customer',?,?) ON CONFLICT(token_hash) DO UPDATE SET id=excluded.id,revoked_at=NULL,created_at=excluded.created_at").bind(id(), tokenHash, c.id, now()),
    ]); await audit(c.id, 'customer.key_rotated', null, '重置客户访问密钥'); return json({key:secret});
  }
  const portalMatch=/^\/api\/admin\/customers\/([\w-]+)\/portal$/.exec(path);
  if (request.method==='POST'&&portalMatch) {
    admin(p);const c=await customer(portalMatch[1]),data=await body(request),hostname=portalHostname(data.hostname);
    const existing=await db().prepare('SELECT customer_id FROM client_portals WHERE hostname=?').bind(hostname).first<{customer_id:string}>();
    if (existing&&existing.customer_id!==c.id) throw new Failure(409,'HOST_ALREADY_BOUND');
    if (data.manage_existing_rules===true) {
      const owner=await db().prepare(`SELECT customer_id FROM port_owners WHERE port=${PORT}`).first<{customer_id:string}>();
      if (owner&&owner.customer_id!==c.id) throw new Failure(409,'PORT_ALREADY_DELEGATED');
      await db().prepare(`INSERT INTO port_owners(port,customer_id) VALUES(${PORT},?) ON CONFLICT(port) DO UPDATE SET customer_id=excluded.customer_id`).bind(c.id).run();
    }
    await db().prepare('INSERT INTO client_portals(hostname,customer_id) VALUES(?,?) ON CONFLICT(customer_id) DO UPDATE SET hostname=excluded.hostname').bind(hostname,c.id).run();
    await audit(c.id,'portal.bound',null,'绑定专属客户入口');return json({hostname});
  }
  const customerMatch = /^\/api\/admin\/customers\/([\w-]+)$/.exec(path);
  if (request.method === 'PATCH' && customerMatch) {
    admin(p); const c = await customer(customerMatch[1]), data = await body(request);
    const devices = integer(data.max_devices, 1, 10, c.max_devices), ips = integer(data.max_ips, 1, 100, c.max_ips);
    const usage = await db().prepare(`SELECT (SELECT count(*) FROM devices WHERE customer_id=? AND enabled=1) AS devices,(SELECT count(*) FROM leases WHERE customer_id=? AND revoked_at IS NULL AND expires_at>?)+${LEGACY_USAGE_SQL} AS ips`).bind(c.id, c.id, now(), c.id).first<{ devices: number; ips: number }>();
    if (devices < (usage?.devices || 0) || ips < (usage?.ips || 0)) throw new Failure(409, 'QUOTA_BELOW_USAGE');
    const tier=data.tier === undefined ? c.tier : data.tier; if (!['standard','vip'].includes(String(tier))) throw new Failure(400,'INVALID_CUSTOMER_TIER');
    await db().prepare('UPDATE customers SET name=?,enabled=?,max_devices=?,max_ips=?,lease_minutes=?,grace_seconds=?,max_manual_days=?,tier=? WHERE id=?').bind(data.name===undefined?c.name:label(data.name), data.enabled === undefined ? c.enabled : data.enabled ? 1 : 0, devices, ips, integer(data.lease_minutes, 5, 10080, c.lease_minutes), integer(data.grace_seconds, 0, 600, c.grace_seconds), integer(data.max_manual_days, 1, 365, c.max_manual_days), String(tier), c.id).run();
    await audit(c.id, 'customer.settings', null, '调整状态或额度'); return json({ ok: true });
  }
  if (request.method === 'POST' && path === '/api/devices') {
    const data = await body(request), cid = customerId(p, typeof data.customer_id === 'string' ? data.customer_id : null), c = await customer(cid);
    const did = id(), secret = token('device');
    const result = await db().prepare('INSERT INTO devices(id,customer_id,name,created_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM devices WHERE customer_id=? AND enabled=1)<? AND EXISTS(SELECT 1 FROM customers WHERE id=? AND enabled=1)').bind(did, cid, label(data.name), now(), cid, c.max_devices, cid).run();
    if (!result.meta.changes) throw new Failure(409, 'DEVICE_LIMIT_REACHED');
    try { await db().prepare("INSERT INTO api_keys(id,token_hash,kind,customer_id,device_id,created_at) VALUES(?,?,'device',?,?,?)").bind(id(), await hashed(secret), cid, did, now()).run(); }
    catch (e) { await db().prepare('DELETE FROM devices WHERE id=?').bind(did).run(); throw e; }
    await audit(cid, 'device.created', null, label(data.name)); return json({ id: did, key: secret }, 201);
  }
  const deviceMatch = /^\/api\/devices\/([\w-]+)$/.exec(path);
  if (request.method === 'DELETE' && deviceMatch) {
    const row = await db().prepare('SELECT customer_id,name FROM devices WHERE id=?').bind(deviceMatch[1]).first<{ customer_id: string; name: string }>();
    if (!row || (p.role !== 'admin' && row.customer_id !== p.customer)) throw new Failure(404, 'DEVICE_NOT_FOUND');
    await db().batch([db().prepare('UPDATE devices SET enabled=0 WHERE id=?').bind(deviceMatch[1]), db().prepare('UPDATE api_keys SET revoked_at=? WHERE device_id=?').bind(now(), deviceMatch[1]), db().prepare('UPDATE leases SET revoked_at=? WHERE device_id=?').bind(now(), deviceMatch[1])]);
    await audit(row.customer_id, 'device.revoked', null, row.name); return json({ ok: true });
  }
  if (request.method === 'POST' && path === '/api/leases') {
    const data = await body(request), cid = customerId(p, typeof data.customer_id === 'string' ? data.customer_id : null), c = await customer(cid), ip = publicIPv4(data.ip), t = now();
    const {expiresAt,expireDate} = expiry(data,t,c.max_manual_days,BUSINESS_TIME_ZONE);
    const result = await db().prepare(`INSERT INTO leases(id,customer_id,ip,label,expires_at,created_at,updated_at)
      SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM leases WHERE customer_id=? AND revoked_at IS NULL AND expires_at>?)+${LEGACY_USAGE_SQL}<(SELECT max_ips FROM customers WHERE id=?)
      AND ${CAPACITY_SQL}
      AND NOT EXISTS(SELECT 1 FROM leases WHERE customer_id=? AND device_id IS NULL AND ip=? AND revoked_at IS NULL AND expires_at>?)
      AND EXISTS(SELECT 1 FROM customers WHERE id=? AND enabled=1)`).bind(id(), cid, ip, label(typeof data.label==='string'&&data.label.trim()?data.label:undefined, 'Manual authorization'), expiresAt, t, t, cid, t, cid, cid, ip, cid, ip, t, cid).run();
    if (!result.meta.changes) throw new Failure(409, 'AUTHORIZATION_CONFLICT');
    await audit(cid, 'ip.added', ip, `Manual grant; expires ${new Date(expiresAt*1000).toISOString()} (${BUSINESS_TIME_ZONE})`); return json({ state: 'pending', expires_at: expiresAt, expire_date: expireDate }, 201);
  }
  const cloudRule=/^\/api\/firewall-rules\/([a-f0-9]{64})$/.exec(path);
  if (request.method==='DELETE'&&cloudRule) {
    const r=await db().prepare(`SELECT ref,cidr FROM cloud_rules WHERE ref=? AND present=1 AND EXISTS(SELECT 1 FROM port_owners WHERE port=${PORT} ${p.role==='admin'?'':'AND customer_id=?'})`).bind(...(p.role==='admin'?[cloudRule[1]]:[cloudRule[1],p.customer])).first<{ref:string;cidr:string}>();
    if (!r) throw new Failure(404,'RULE_NOT_FOUND');
    const grants=await activeLeases(null);
    if (r.cidr.endsWith('/32')&&grants.some(l=>covers(r.cidr,l.ip))) throw new Failure(409,'RULE_STILL_REQUIRED');
    await db().prepare('UPDATE cloud_rules SET delete_requested_at=? WHERE ref=?').bind(now(),r.ref).run();
    await audit(p.customer,'ip.cloud_deleted',r.cidr,`删除现有 TCP ${PORT} 来源授权`);return json({state:'pending',note_code:'RULE_DELETION_PENDING',note:`Removing this source authorization for TCP ${PORT}.`},202);
  }
  const leaseMatch = /^\/api\/leases\/([\w-]+)$/.exec(path);
  if (request.method === 'PATCH' && leaseMatch) {
    const row = await db().prepare('SELECT * FROM leases WHERE id=?').bind(leaseMatch[1]).first<Lease>();
    if (!row || (p.role !== 'admin' && row.customer_id !== p.customer)) throw new Failure(404,'AUTHORIZATION_NOT_FOUND');
    if (row.device_id) throw new Failure(400,'AUTOMATIC_EXPIRY_MANAGED');
    const c=await customer(row.customer_id), t=now(), value=expiry(await body(request),t,c.max_manual_days,BUSINESS_TIME_ZONE);
    const result=await db().prepare(`UPDATE leases SET expires_at=?,revoked_at=NULL,updated_at=? WHERE id=?
      AND EXISTS(SELECT 1 FROM customers WHERE id=? AND enabled=1)
      AND (SELECT count(*) FROM leases WHERE customer_id=? AND id<>? AND revoked_at IS NULL AND expires_at>?)+${LEGACY_USAGE_SQL}<(SELECT max_ips FROM customers WHERE id=?)
      AND ${CAPACITY_SQL}`).bind(value.expiresAt,t,row.id,c.id,c.id,row.id,t,c.id,c.id,row.ip).run();
    if (!result.meta.changes) throw new Failure(409,'RENEWAL_CONFLICT');
    await audit(c.id,'ip.renewed',row.ip,`Renewed until ${new Date(value.expiresAt*1000).toISOString()} (${BUSINESS_TIME_ZONE})`); return json({expires_at:value.expiresAt,expire_date:value.expireDate});
  }
  if (request.method === 'DELETE' && leaseMatch) {
    const row = await db().prepare('SELECT customer_id,ip FROM leases WHERE id=?').bind(leaseMatch[1]).first<{ customer_id: string; ip: string }>();
    if (!row || (p.role !== 'admin' && row.customer_id !== p.customer)) throw new Failure(404, 'AUTHORIZATION_NOT_FOUND');
    await db().prepare('UPDATE leases SET revoked_at=? WHERE id=?').bind(now(), leaseMatch[1]).run();
    await audit(row.customer_id, 'ip.revoked', row.ip, '撤销 IP；自动设备下次心跳可重新授权，永久停用请撤销设备'); return json({ ok: true });
  }
  throw new Failure(404, 'NOT_FOUND');
}
export default {
  async fetch(request: Request) {
    try {
      const response = await handle(request);
      response.headers.set('X-Content-Type-Options', 'nosniff'); response.headers.set('Referrer-Policy', 'no-referrer'); response.headers.set('X-Frame-Options', 'DENY');
      return response;
    } catch (e) {
      const status = e instanceof Failure ? e.status : 500;
      const code = e instanceof Failure ? e.code : 'SERVICE_UNAVAILABLE';
      if (status === 500) console.error(JSON.stringify({ event: 'request_failed', path: new URL(request.url).pathname, type: e instanceof Error ? e.name : 'unknown', detail: e instanceof Error ? e.message.replace(/(?:\d{1,3}\.){3}\d{1,3}/g,'[address]').replace(/pa_[A-Za-z0-9_-]+/g,'[credential]').slice(0,400) : 'unknown' }));
      return json({ code, params: e instanceof Failure ? e.params : {}, error: errorMessages[code].en }, status);
    }
  },
  async scheduled() {
    await db().batch([
      db().prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()), db().prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now()),
      db().prepare('DELETE FROM telemetry_samples WHERE at<?').bind(now()-86400),
      db().prepare('DELETE FROM access_events WHERE at<?').bind(now() - 7 * 86400), db().prepare('DELETE FROM audit WHERE created_at<?').bind(now() - 30 * 86400),
    ]);
  },
} satisfies ExportedHandler;
