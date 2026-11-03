import { ClientError } from './api';
import type { Locale, MessageKey } from './i18n';
import type {
  Portal,
  Dashboard,
  Network,
  Transport,
  GrantState,
  Lease,
  Role,
  SyncState,
} from './types';
export type Notice =
  | { key: MessageKey; error?: false }
  | { error: true; code: string; params: Record<string, string | number> };
export type Snapshot = {
  locale: Locale;
  theme: 'light' | 'dark';
  portal: Portal | null;
  dashboard: Dashboard | null;
  network: Network | null;
  selected: string;
  loading: boolean;
  busy: Record<string, boolean>;
  notice: Notice | null;
  fatal: ClientError | null;
  secret: { value: string; device: boolean } | null;
  submitted: Record<string, number>;
  removing: Record<string, number>;
  grantIntent: { ip: string | null; nonce: number } | null;
};
const saved = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const persist = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage is optional. */
  }
};
export class PortalStore {
  private listeners = new Set<() => void>();
  private refreshPromise: Promise<void> | null = null;
  private selectionPromise: Promise<void> | null = null;
  private sequence = 0;
  private serverClock: { at: number; received: number } | null = null;
  state: Snapshot;
  constructor(public transport: Transport) {
    const language =
      new URLSearchParams(location.search).get('lang') || saved('pa.locale') || navigator.language;
    this.state = {
      locale: language.startsWith('zh') ? 'zh-CN' : 'en',
      theme: saved('pa.theme') === 'dark' ? 'dark' : 'light',
      portal: null,
      dashboard: null,
      network: null,
      selected: '',
      loading: true,
      busy: {},
      notice: null,
      fatal: null,
      secret: null,
      submitted: {},
      removing: {},
      grantIntent: null,
    };
    this.transport.setLocale?.(this.state.locale);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  patch(value: Partial<Snapshot>) {
    this.state = { ...this.state, ...value };
    for (const listener of this.listeners) listener();
  }
  setLocale(locale: Locale) {
    persist('pa.locale', locale);
    this.transport.setLocale?.(locale);
    this.patch({ locale });
    if (this.transport.demo && this.state.dashboard)
      void this.refresh().catch((error) => this.fail(error));
  }
  setTheme(theme: 'light' | 'dark') {
    persist('pa.theme', theme);
    this.patch({ theme });
  }
  notify(key: MessageKey) {
    this.patch({ notice: { key } });
  }
  fail(error: unknown) {
    const e = error instanceof ClientError ? error : new ClientError('SERVICE_UNAVAILABLE');
    if (e.status === 401) {
      this.sequence++;
      this.patch({
        dashboard: null,
        secret: null,
        selected: '',
        network: null,
        submitted: {},
        removing: {},
        grantIntent: null,
      });
    }
    const dashboard = this.state.dashboard;
    if (dashboard && this.serverClock) {
      const serverTime =
        this.serverClock.at + Math.floor((performance.now() - this.serverClock.received) / 1000);
      const stale =
        dashboard.synchronization.updated_at > 0 &&
        serverTime - dashboard.synchronization.updated_at >= 90;
      this.patch({
        dashboard: {
          ...dashboard,
          server_time: serverTime,
          synchronization: {
            ...dashboard.synchronization,
            state: stale ? 'stale' : dashboard.synchronization.state,
          },
        },
      });
    }
    this.patch({ notice: { error: true, code: e.code, params: e.params } });
  }
  async bootstrap() {
    this.patch({ loading: true });
    try {
      this.patch({ portal: await this.transport.request<Portal>('/api/portal'), fatal: null });
      await this.refresh();
    } catch (e) {
      if (!(e instanceof ClientError && e.status === 401))
        this.patch({
          fatal: e instanceof ClientError ? e : new ClientError('SERVICE_UNAVAILABLE'),
        });
    } finally {
      this.patch({ loading: false });
    }
  }
  async refresh() {
    if (this.refreshPromise) return this.refreshPromise;
    const sequence = this.sequence;
    this.refreshPromise = (async () => {
      let dashboard = await this.transport.request<Dashboard>(
        '/api/dashboard' +
          (this.state.selected ? '?customer=' + encodeURIComponent(this.state.selected) : ''),
      );
      if (dashboard.role === 'admin' && !this.state.selected && dashboard.customers?.length) {
        const selected = (dashboard.customers.find((c) => c.enabled) || dashboard.customers[0]).id;
        if (sequence !== this.sequence) return;
        this.patch({ selected });
        dashboard = await this.transport.request<Dashboard>(
          '/api/dashboard?customer=' + encodeURIComponent(selected),
        );
      }
      if (sequence === this.sequence) {
        this.serverClock = { at: dashboard.server_time, received: performance.now() };
        this.patch({ dashboard, fatal: null });
      }
    })().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }
  async run(id: string, action: () => Promise<void>) {
    if (this.state.busy[id]) return false;
    this.patch({ busy: { ...this.state.busy, [id]: true } });
    try {
      await action();
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    } finally {
      this.patch({ busy: { ...this.state.busy, [id]: false } });
    }
  }
  async login(key: string) {
    return this.run('login', async () => {
      await this.transport.request('/api/login', 'POST', { key });
      await this.refresh();
    });
  }
  async logout() {
    await this.run('logout', async () => {
      await this.transport.request('/api/logout', 'POST', {});
      this.sequence++;
      this.patch({
        dashboard: null,
        selected: '',
        network: null,
        secret: null,
        notice: null,
        submitted: {},
        removing: {},
        grantIntent: null,
      });
    });
  }
  async selectCustomer(selected: string) {
    this.sequence++;
    this.patch({ selected, secret: null, submitted: {}, removing: {}, grantIntent: null });
    if (!this.selectionPromise) {
      this.selectionPromise = (async () => {
        await this.run('selection', async () => {
          while (true) {
            const sequence = this.sequence;
            await this.refreshPromise?.catch(() => {});
            await this.refresh();
            if (sequence === this.sequence) break;
          }
        });
      })().finally(() => {
        this.selectionPromise = null;
      });
    }
    await this.selectionPromise;
  }
  async detect() {
    let network: Network | null = null;
    await this.run('detect', async () => {
      network = {
        ...(await this.transport.request<Omit<Network, 'at'>>('/api/ip')),
        at: Math.floor(Date.now() / 1000),
      };
      this.patch({ network });
      if (!network.ipv4) this.notify('networkUnavailable');
    });
    return network as Network | null;
  }
  account() {
    const d = this.state.dashboard;
    return d?.role === 'admin'
      ? d.customers?.find((c) => c.id === this.state.selected)
      : d?.account;
  }
  async authorizeCurrent() {
    const network = await this.detect();
    this.patch({ grantIntent: { ip: network?.ipv4 || null, nonce: Date.now() } });
  }
  async addGrant(data: { ip: string; label: string; expire_date: string }) {
    return this.run('grant', async () => {
      await this.transport.request('/api/leases', 'POST', {
        ...data,
        ...(this.state.dashboard?.role === 'admin' ? { customer_id: this.state.selected } : {}),
      });
      this.patch({ submitted: { ...this.state.submitted, [data.ip]: Date.now() } });
      this.notify('requestSaved');
      await this.refresh();
    });
  }
  async renew(lease: Lease, expire_date: string) {
    return this.run('renew', async () => {
      await this.transport.request('/api/leases/' + lease.id, 'PATCH', { expire_date });
      this.patch({ submitted: { ...this.state.submitted, [lease.ip]: Date.now() } });
      this.notify('expirySaved');
      await this.refresh();
    });
  }
  async remove(lease: Lease) {
    return this.run('delete:' + lease.id, async () => {
      await this.transport.request('/api/leases/' + lease.id, 'DELETE');
      this.patch({ removing: { ...this.state.removing, [lease.id]: Date.now() } });
      this.notify('removalRequested');
      await this.refresh();
    });
  }
  async removeRule(ref: string) {
    return this.run('delete:' + ref, async () => {
      await this.transport.request('/api/firewall-rules/' + ref, 'DELETE');
      this.notify('removalRequested');
      await this.refresh();
    });
  }
  async createDevice(name: string) {
    return this.run('device', async () => {
      const result = await this.transport.request<{ key: string }>('/api/devices', 'POST', {
        name,
        ...(this.state.dashboard?.role === 'admin' ? { customer_id: this.state.selected } : {}),
      });
      this.patch({ secret: { value: result.key, device: true } });
      await this.refresh();
    });
  }
  async revokeDevice(id: string) {
    return this.run('device:' + id, async () => {
      await this.transport.request('/api/devices/' + id, 'DELETE');
      this.notify('deviceRevoked');
      await this.refresh();
    });
  }
  async admin(path: string, method: string, data: unknown) {
    return this.run('admin', async () => {
      await this.transport.request(path, method, data);
      this.notify('settingsSaved');
      await this.refresh();
    });
  }
  async createCustomer(name: string) {
    return this.run('admin', async () => {
      const value = await this.transport.request<{ id: string; key: string }>(
        '/api/admin/customers',
        'POST',
        { name },
      );
      this.patch({ selected: value.id, secret: { value: value.key, device: false } });
      await this.refresh();
    });
  }
  async rotateToken() {
    return this.run('admin', async () => {
      const value = await this.transport.request<{ key: string }>(
        '/api/admin/customers/' + this.state.selected + '/key',
        'POST',
        {},
      );
      this.patch({ secret: { value: value.key, device: false } });
      await this.refresh();
    });
  }
  grantState(lease: Lease): GrantState {
    const d = this.state.dashboard!;
    if (lease.revoked_at) return lease.removal_pending ? 'deleting' : 'revoked';
    if (lease.expires_at <= d.server_time) return 'expired';
    if (d.synchronization.state === 'error' || d.synchronization.state === 'stale')
      return 'syncFailed';
    if (lease.applied) return 'applied';
    return Date.now() - (this.state.submitted[lease.ip] || 0) < 3000 ? 'submitted' : 'syncing';
  }
  async demoRole(role: Role) {
    this.transport.setRole?.(role);
    this.sequence++;
    this.patch({
      selected: '',
      dashboard: null,
      secret: null,
      notice: null,
      submitted: {},
      removing: {},
      grantIntent: null,
      loading: true,
    });
    await this.refreshPromise?.catch(() => {});
    this.patch({ portal: await this.transport.request<Portal>('/api/portal') });
    await this.refresh();
    this.patch({ loading: false });
  }
  async demoSync(sync: SyncState) {
    this.transport.setSync?.(sync);
    await this.refresh();
  }
  async resetDemo() {
    this.transport.reset?.();
    await this.demoRole('customer');
  }
}
