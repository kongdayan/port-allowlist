export type Role = 'admin' | 'customer';
export type SyncState = 'ready' | 'unavailable' | 'stale' | 'dry_run' | 'error';
export type Portal = {
  mode: 'operator' | 'customer';
  name: string;
  brand: string;
  service: string;
  port: number;
};
export type Account = {
  name: string;
  max_ips: number;
  max_devices: number;
  max_manual_days: number;
  lease_minutes: number;
  grace_seconds: number;
  enabled?: number;
  tier?: 'standard' | 'vip';
};
export type Customer = Account & { id: string; enabled: number };
export type Lease = {
  id: string;
  ip: string;
  label: string;
  device_id: string | null;
  previous_ip?: string | null;
  previous_until?: number | null;
  expires_at: number;
  revoked_at: number | null;
  expire_date: string | null;
  expiry_kind: 'automatic' | 'date' | 'legacy_hours';
  applied: boolean;
  updated_at: number;
  created_at: number;
  removal_pending?: boolean;
};
export type FirewallRule = { ref: string; cidr: string; delete_requested_at: number | null };
export type Device = {
  id: string;
  name: string;
  enabled: number;
  last_seen: number | null;
  created_at: number;
};
export type Sample = {
  at: number;
  connections: number;
  ips: number;
  up_bps: number | null;
  down_bps: number | null;
  healthy: boolean | null;
  limited?: boolean;
};
export type AccessEvent = {
  id: string;
  ip: string;
  at: number;
  bytes_up: number;
  bytes_down: number;
  duration: number;
  status: string;
};
export type Audit = { action: string; ip: string | null; detail: string; created_at: number };
export type Dashboard = {
  role: Role;
  port: number;
  account?: Account;
  customer_id?: string | null;
  customers?: Customer[];
  leases: Lease[];
  firewall_rules: FirewallRule[];
  devices: Device[];
  server_time: number;
  synchronization: { state: SyncState; updated_at: number; last_reconciled_at?: number };
  expiry: {
    time_zone: string;
    today: string;
    default_days: number;
    default_expire_date: string;
    max_expire_date: string;
  };
  monitor: {
    current: Sample;
    history: Sample[];
    traffic: Record<string, { up_bps: number; down_bps: number }>;
  };
  events: AccessEvent[];
  audit: Audit[];
  service?: { updated_at: number; available: boolean; active: Record<string, number> };
  agent?: {
    updated_at: number;
    error: string | null;
    mode: string;
    active: Record<string, number>;
    legacy: string[];
    managed: string[];
  };
};
export type Network = { detected: string; ipv4: string | null; at: number };
export type GrantState =
  'submitted' | 'syncing' | 'applied' | 'deleting' | 'syncFailed' | 'expired' | 'revoked';
export interface Transport {
  request<T>(path: string, method?: string, data?: unknown): Promise<T>;
  demo: boolean;
  reset?(): void;
  setRole?(role: Role): void;
  setLocale?(locale: 'en' | 'zh-CN'): void;
  setSync?(sync: SyncState): void;
}
