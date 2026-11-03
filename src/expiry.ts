import { Temporal } from '@js-temporal/polyfill';
import { PublicError } from '../shared/errors';
import { integer } from './policy';
export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';
export function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch {
    throw new Error('Invalid configured business time zone');
  }
}
const fixedOffset = (zone: string) =>
  zone === 'Asia/Shanghai' ? 28800 : ['UTC', 'Etc/UTC'].includes(zone) ? 0 : null;
export const localDay = (at: number, timeZone = DEFAULT_TIME_ZONE) => {
  const offset = fixedOffset(timeZone);
  return offset === null
    ? Temporal.Instant.fromEpochMilliseconds(at * 1000)
        .toZonedDateTimeISO(timeZone)
        .toPlainDate()
        .toString()
    : new Date((at + offset) * 1000).toISOString().slice(0, 10);
};
export const dateAfter = (at: number, days: number, timeZone = DEFAULT_TIME_ZONE) =>
  fixedOffset(timeZone) === null
    ? Temporal.PlainDate.from(localDay(at, timeZone)).add({ days }).toString()
    : localDay(at + days * 86400, timeZone);
export function midnight(value: unknown, timeZone = DEFAULT_TIME_ZONE): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new PublicError(400, 'DATE_FORMAT_INVALID');
  try {
    const offset = fixedOffset(timeZone);
    if (offset !== null) {
      const at = Date.parse(value + 'T00:00:00Z') / 1000 - offset;
      if (!Number.isFinite(at) || localDay(at, timeZone) !== value) throw new Error('Invalid date');
      return at;
    }
    const date = Temporal.PlainDate.from(value);
    const start = date.toZonedDateTime(timeZone);
    if (start.toPlainDate().toString() !== value) throw new Error('Skipped calendar day');
    return start.epochMilliseconds / 1000;
  } catch {
    throw new PublicError(400, 'DATE_INVALID');
  }
}
export function expiry(
  data: Record<string, unknown>,
  at: number,
  maxDays: number,
  timeZone = DEFAULT_TIME_ZONE,
) {
  if (data.hours !== undefined) throw new PublicError(400, 'DAYS_REQUIRED');
  const date =
    data.expire_date === undefined
      ? dateAfter(at, integer(data.days, 1, maxDays, Math.min(30, maxDays)), timeZone)
      : data.expire_date;
  const expiresAt = midnight(date, timeZone);
  if (expiresAt <= at || expiresAt > midnight(dateAfter(at, maxDays, timeZone), timeZone))
    throw new PublicError(400, 'DATE_OUT_OF_RANGE', { max: maxDays });
  return { expiresAt, expireDate: String(date) };
}
