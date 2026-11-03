import { integer } from './policy';

const DAY = 86400, OFFSET = 8 * 3600;
export const localDay = (at: number) => new Date((at + OFFSET) * 1000).toISOString().slice(0, 10);
export const dateAfter = (at: number, days: number) => localDay(at + days * DAY);
export function midnight(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('到期日期格式应为 YYYY-MM-DD');
  const at = Date.parse(value + 'T00:00:00+08:00') / 1000;
  if (!Number.isFinite(at) || localDay(at) !== value) throw new Error('到期日期无效');
  return at;
}
export function expiry(data: Record<string, unknown>, at: number, maxDays: number) {
  if (data.hours !== undefined) throw new Error('授权已改为按天，请刷新页面后重新选择到期日期');
  const date = data.expire_date === undefined ? dateAfter(at, integer(data.days, 1, maxDays, Math.min(30, maxDays))) : data.expire_date;
  const expiresAt = midnight(date);
  if (expiresAt <= at || expiresAt > midnight(dateAfter(at, maxDays))) throw new Error(`到期日期须晚于现在，且不超过 ${maxDays} 个自然日`);
  return { expiresAt, expireDate: String(date) };
}
