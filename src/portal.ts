import { PublicError } from '../shared/errors';
import { env } from 'cloudflare:workers';
import { validTimeZone } from './expiry';
export type ClientPortal = { customer_id: string; name: string; hostname: string };
export const PORT = Number(env.MANAGED_PORT || 10800);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535)
  throw new Error('Invalid configured TCP port');
export const BRAND = env.BRAND || 'Port Access';
export const operatorHosts = new Set(
  String(env.OPERATOR_HOSTS || 'localhost,operator.localhost')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
export function portalHostname(value: unknown) {
  if (typeof value !== 'string') throw new PublicError(400, 'INVALID_PORTAL_HOST');
  const host = value.trim().toLowerCase();
  const labels = host.split('.');
  if (
    host.length > 253 ||
    labels.length < 2 ||
    labels.some((s) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) ||
    /^\d+$/.test(labels.at(-1)!) ||
    operatorHosts.has(host)
  )
    throw new PublicError(400, 'INVALID_PORTAL_HOST');
  return host;
}

export const BUSINESS_TIME_ZONE = validTimeZone(String(env.BUSINESS_TIME_ZONE || 'Asia/Shanghai'));
