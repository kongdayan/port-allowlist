import {covers} from './policy';
export type Traffic = Record<string, { up_bps: number; down_bps: number }>;
export type Agent = { managed: string[]; legacy: string[]; active: Record<string, number>; traffic?: Traffic; traffic_available?: boolean; traffic_interval?: number; traffic_limited?: boolean; error: string | null; mode: string; last_apply?: number };
export function sampleView(a: Agent, allowed: Set<string> | null, at: number, networks: string[] = []) {
  const active = Object.entries(a.active).filter(([ip]) => !allowed || allowed.has(ip) || networks.some(net=>covers(net,ip)));
  const traffic = Object.entries(a.traffic || {}).filter(([ip]) => !allowed || allowed.has(ip) || networks.some(net=>covers(net,ip)));
  return { at, connections: active.reduce((sum, [, n]) => sum + n, 0), ips: active.filter(([, n]) => n > 0).length,
    up_bps: a.traffic_available ? traffic.reduce((sum, [, n]) => sum + n.up_bps, 0) : null,
    down_bps: a.traffic_available ? traffic.reduce((sum, [, n]) => sum + n.down_bps, 0) : null,
    healthy: !a.error && a.mode === 'apply', limited: !!a.traffic_limited };
}
