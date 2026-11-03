// Isolated browser-memory sandbox. No credentials, persistence, telemetry uploads or cloud requests.
import { ClientError } from './api';
import { publicIPv4 } from '../src/policy';
import { plusDays } from './i18n';
import type { Transport, Role, SyncState, Dashboard, Customer, Lease, Portal } from './types';
const address = (...parts: number[]) => parts.join('.');
const now = () => Math.floor(Date.now() / 1000);
const today = () => new Date((now() + 28800) * 1000).toISOString().slice(0, 10);
const midnight = (date: string) => Date.parse(date + 'T00:00:00+08:00') / 1000;
const customer = (id: string, name: string): Customer => ({
  id,
  name,
  max_ips: 100,
  max_devices: 10,
  max_manual_days: 365,
  lease_minutes: 60,
  grace_seconds: 120,
  enabled: 1,
  tier: 'vip',
});
export class DemoTransport implements Transport {
  demo = true;
  private role: Role = 'customer';
  private locale: 'en' | 'zh-CN' = 'en';
  private sync: SyncState = 'ready';
  private data: Dashboard;
  private pending = new Map<string, number>();
  private next = 20;
  constructor() {
    this.data = this.seed();
  }
  private seed(): Dashboard {
    const at = now();
    const lease = (
      id: string,
      ip: string,
      label: string,
      days: number,
      device_id: string | null = null,
    ): Lease => ({
      id,
      ip,
      label,
      device_id,
      expires_at: device_id ? at + 60 * 60 : midnight(plusDays(today(), days)),
      revoked_at: null,
      expire_date: device_id ? null : plusDays(today(), days),
      expiry_kind: device_id ? 'automatic' : 'date',
      applied: days > 0,
      updated_at: at - 300,
      created_at: at - 86400,
    });
    const current = { at, connections: 7, ips: 2, up_bps: 18320, down_bps: 98400, healthy: true };
    return {
      role: 'customer',
      port: 10800,
      account: customer('demo-studio', 'Northstar Studio'),
      customers: [
        customer('demo-studio', 'Northstar Studio'),
        customer('demo-partner', 'Example Partner'),
      ],
      customer_id: 'demo-studio',
      leases: [
        lease('office', address(11, 64, 10, 20), 'Studio network', 30),
        lease('home', address(11, 65, 10, 30), 'Home workspace', 90),
        lease('laptop', address(11, 66, 10, 40), 'Automatic update', 1, 'demo-device'),
        lease('travel', address(11, 67, 10, 50), 'Travel network', -1),
      ],
      firewall_rules: [
        { ref: 'a'.repeat(64), cidr: address(11, 68, 10, 60) + '/32', delete_requested_at: null },
      ],
      devices: [
        {
          id: 'demo-device',
          name: 'Work laptop',
          enabled: 1,
          last_seen: at - 25,
          created_at: at - 86400,
        },
      ],
      server_time: at,
      synchronization: { state: 'ready', updated_at: at, last_reconciled_at: at },
      expiry: {
        time_zone: 'Asia/Shanghai',
        today: today(),
        default_days: 30,
        default_expire_date: plusDays(today(), 30),
        max_expire_date: plusDays(today(), 365),
      },
      monitor: {
        current,
        history: Array.from({ length: 55 }, (_, i) => ({
          at: Math.floor(at / 60) * 60 - (54 - i) * 60,
          connections: Math.max(1, Math.round(5 + 3 * Math.sin(i * 0.4))),
          ips: 2,
          up_bps: Math.round(16000 + 9000 * Math.sin(i * 0.31)),
          down_bps: Math.round(82000 + 65000 * Math.sin(i * 0.24) ** 2),
          healthy: true,
        })),
        traffic: {},
      },
      service: {
        updated_at: at,
        available: true,
        active: { [address(11, 64, 10, 20)]: 5, [address(11, 66, 10, 40)]: 2 },
      },
      events: Array.from({ length: 12 }, (_, i) => ({
        id: 'demo-session-' + i,
        ip: address(11, i % 2 ? 64 : 66, 10, i % 2 ? 20 : 40),
        at: at - 120 - i * 180,
        bytes_up: 40000 + i * 5300,
        bytes_down: 260000 + i * 17000,
        duration: 18.5 + i * 5.4,
        status: '200',
      })),
      audit: [
        { action: 'ip.added', ip: address(11, 64, 10, 20), detail: '', created_at: at - 300 },
      ],
    };
  }
  reset() {
    this.data = this.seed();
    this.pending.clear();
    this.sync = 'ready';
    this.role = 'customer';
  }
  setLocale(locale: 'en' | 'zh-CN') {
    this.locale = locale;
  }
  setRole(role: Role) {
    this.role = role;
  }
  setSync(sync: SyncState) {
    this.sync = sync;
  }
  private dashboard(selected: string | null): Dashboard {
    for (const [id, at] of this.pending) {
      if (Date.now() - at < 1800 || this.sync !== 'ready') continue;
      const lease = this.data.leases.find((l) => l.id === id);
      if (lease) {
        lease.applied = !lease.revoked_at;
        lease.removal_pending = false;
      }
      this.data.firewall_rules = this.data.firewall_rules.filter(
        (r) => !(r.ref === id && r.delete_requested_at),
      );
      this.pending.delete(id);
    }
    const d = structuredClone(this.data),
      at = now();
    const labels: Record<string, [string, string]> = {
      office: ['Studio network', '工作室网络'],
      home: ['Home workspace', '居家办公'],
      travel: ['Travel network', '出差网络'],
    };
    for (const lease of d.leases)
      if (labels[lease.id]) lease.label = labels[lease.id][this.locale === 'zh-CN' ? 1 : 0];
    for (const device of d.devices)
      if (device.id === 'demo-device')
        device.name = this.locale === 'zh-CN' ? '工作笔记本' : 'Work laptop';
    d.role = this.role;
    d.server_time = at;
    d.synchronization = {
      state: this.sync,
      updated_at: this.sync === 'unavailable' ? 0 : this.sync === 'stale' ? at - 180 : at,
      last_reconciled_at: at,
    };
    const picked =
      d.customers!.find((c) => c.id === (selected || 'demo-studio')) || d.customers![0];
    d.account = picked;
    d.customer_id = picked.id;
    if (picked.id !== 'demo-studio') {
      d.leases = [];
      d.firewall_rules = [];
      d.devices = [];
      d.events = [];
      d.audit = [];
      d.monitor = {
        current: {
          at,
          connections: 0,
          ips: 0,
          up_bps: null,
          down_bps: null,
          healthy: this.sync === 'ready',
        },
        history: [],
        traffic: {},
      };
    }
    d.monitor.current.at = this.sync === 'stale' ? at - 180 : at;
    d.monitor.current.healthy = this.sync === 'ready';
    for (const l of d.leases) if (this.sync !== 'ready' && !l.revoked_at) l.applied = false;
    d.service = {
      updated_at: d.synchronization.updated_at,
      available: this.sync === 'ready',
      active: d.service?.active || {},
    };
    if (this.role === 'admin') {
      d.agent = {
        updated_at: d.synchronization.updated_at,
        error: this.sync === 'error' ? 'demo_sync_error' : null,
        mode: this.sync === 'dry_run' ? 'dry-run' : 'apply',
        active: d.service.active,
        legacy: d.firewall_rules.map((r) => r.cidr),
        managed: d.leases.filter((l) => l.applied).map((l) => l.ip + '/32'),
      };
      delete d.account;
      delete d.service;
    } else {
      const { name, max_ips, max_devices, max_manual_days, lease_minutes, grace_seconds } = picked;
      d.account = { name, max_ips, max_devices, max_manual_days, lease_minutes, grace_seconds };
      delete d.customers;
      delete d.customer_id;
      delete d.agent;
    }
    return d;
  }
  async request<T>(path: string, method = 'GET', input?: unknown): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, 120));
    const u = new URL(path, 'https://demo.example.com');
    const data = (input || {}) as Record<string, unknown>;
    const p = u.pathname;
    let value: unknown = { ok: true };
    const deny = () => {
      throw new ClientError('ADMIN_REQUIRED', {}, 403);
    };
    if (p === '/api/portal') {
      value = {
        mode: this.role === 'admin' ? 'operator' : 'customer',
        name: this.role === 'admin' ? 'Port Access' : 'Northstar Studio',
        brand: 'Port Access',
        service: 'Network Access',
        port: 10800,
      } satisfies Portal;
    } else if (p === '/api/dashboard') value = this.dashboard(u.searchParams.get('customer'));
    else if (p === '/api/ip')
      value = { detected: address(11, 69, 10, 70), ipv4: address(11, 69, 10, 70) };
    else if (p === '/api/login' || p === '/api/logout') value = { role: this.role };
    else if (p === '/api/leases' && method === 'POST') {
      let ip: string;
      try {
        ip = publicIPv4(data.ip);
      } catch {
        throw new ClientError('PUBLIC_IP_REQUIRED', {}, 400);
      }
      const account = this.data.customers![0];
      if (
        this.data.leases.filter((l) => !l.revoked_at && l.expires_at > now()).length +
          this.data.firewall_rules.length >=
        account.max_ips
      )
        throw new ClientError('AUTHORIZATION_LIMIT_REACHED', {}, 409);
      if (this.data.leases.some((l) => l.ip === ip && !l.revoked_at && l.expires_at > now()))
        throw new ClientError('AUTHORIZATION_CONFLICT', {}, 409);
      const date = String(data.expire_date),
        expires = midnight(date);
      if (
        !Number.isFinite(expires) ||
        expires <= now() ||
        expires > midnight(plusDays(today(), account.max_manual_days))
      )
        throw new ClientError('DATE_OUT_OF_RANGE', { max: account.max_manual_days }, 400);
      const id = 'demo-grant-' + this.next++;
      this.data.leases.unshift({
        id,
        ip,
        label: String(data.label || 'Manual authorization'),
        device_id: null,
        expires_at: expires,
        expire_date: date,
        expiry_kind: 'date',
        revoked_at: null,
        applied: false,
        created_at: now(),
        updated_at: now(),
      });
      this.pending.set(id, Date.now());
      value = { state: 'pending' };
    } else if (/^\/api\/leases\//.test(p)) {
      const lease = this.data.leases.find((l) => l.id === p.split('/').at(-1));
      if (!lease) throw new ClientError('AUTHORIZATION_NOT_FOUND', {}, 404);
      if (method === 'DELETE') {
        lease.revoked_at = now();
        lease.removal_pending = true;
      } else {
        const expires = midnight(String(data.expire_date));
        if (!Number.isFinite(expires) || expires <= now())
          throw new ClientError('DATE_INVALID', {}, 400);
        lease.expires_at = expires;
        lease.expire_date = String(data.expire_date);
        lease.applied = false;
      }
      this.pending.set(lease.id, Date.now());
    } else if (p.startsWith('/api/firewall-rules/') && method === 'DELETE') {
      const rule = this.data.firewall_rules.find((r) => r.ref === p.split('/').at(-1));
      if (!rule) throw new ClientError('RULE_NOT_FOUND', {}, 404);
      rule.delete_requested_at = now();
      this.pending.set(rule.ref, Date.now());
    } else if (p === '/api/devices' && method === 'POST') {
      const id = 'demo-device-' + this.next++;
      if (this.data.devices.filter((d) => d.enabled).length >= this.data.customers![0].max_devices)
        throw new ClientError('DEVICE_LIMIT_REACHED', {}, 409);
      this.data.devices.push({
        id,
        name: String(data.name),
        enabled: 1,
        last_seen: null,
        created_at: now(),
      });
      value = { id, key: 'DEMO-DEVICE-TOKEN-NOT-A-CREDENTIAL' };
    } else if (p.startsWith('/api/devices/') && method === 'DELETE') {
      const device = this.data.devices.find((d) => d.id === p.split('/').at(-1));
      if (device) device.enabled = 0;
      for (const l of this.data.leases)
        if (l.device_id === device?.id) {
          l.revoked_at = now();
          l.removal_pending = true;
          this.pending.set(l.id, Date.now());
        }
    } else if (p.startsWith('/api/admin/')) {
      if (this.role !== 'admin') deny();
      if (p === '/api/admin/customers') {
        const id = 'demo-customer-' + this.next++;
        this.data.customers!.unshift(customer(id, String(data.name)));
        value = { id, key: 'DEMO-CUSTOMER-TOKEN-NOT-A-CREDENTIAL' };
      } else if (p.endsWith('/key')) value = { key: 'DEMO-ROTATED-TOKEN-NOT-A-CREDENTIAL' };
      else if (p.endsWith('/portal')) value = { hostname: data.hostname };
      else {
        const c = this.data.customers!.find((c) => c.id === p.split('/').at(-1));
        if (c) {
          for (const key of [
            'name',
            'enabled',
            'max_ips',
            'max_devices',
            'max_manual_days',
            'lease_minutes',
            'grace_seconds',
            'tier',
          ])
            if (key in data) Object.assign(c, { [key]: data[key] });
        }
      }
    } else throw new ClientError('NOT_FOUND', {}, 404);
    return value as T;
  }
}
