import { PublicError } from '../shared/errors';
export function ipv4Number(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 4 || parts.some(x => !/^(0|[1-9]\d{0,2})$/.test(x) || Number(x) > 255)) return null;
  return parts.reduce((n, x) => n * 256 + Number(x), 0);
}
export function publicIPv4(value: unknown): string {
  if (typeof value !== 'string') throw new PublicError(400, 'IP_REQUIRED');
  const ip = value.endsWith('/32') ? value.slice(0, -3) : value;
  const n = ipv4Number(ip);
  const octets = ip.split('.').map(Number);
  if (n === null || octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || octets[0] >= 224 ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
      (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && [0, 168].includes(octets[1])) ||
      (octets[0] === 198 && [18, 19].includes(octets[1])) ||
      (octets[0] === 192 && octets[1] === 0 && octets[2] === 2) || (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113)) {
    throw new PublicError(400, 'PUBLIC_IP_REQUIRED');
  }
  return ip;
}
export function covers(cidr: string, ip: string): boolean {
  const [network, mask = '32'] = cidr.split('/');
  const a = ipv4Number(network), b = ipv4Number(ip), bits = Number(mask);
  if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  return Math.floor(a / 2 ** (32 - bits)) === Math.floor(b / 2 ** (32 - bits));
}
export function integer(value: unknown, low: number, high: number, fallback: number): number {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < low || n > high) throw new PublicError(400, 'NUMBER_OUT_OF_RANGE', {min:low,max:high});
  return n;
}
