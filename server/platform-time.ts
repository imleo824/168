import { Prisma } from '@prisma/client';

export const PLATFORM_TIMEZONE = 'Asia/Shanghai';
export const PLATFORM_TIMEZONE_OFFSET_HOURS = 8;
export const PLATFORM_TIMEZONE_OFFSET_MS = PLATFORM_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const PLATFORM_SQL_UTC_TIMEZONE = 'UTC';

export function getPlatformSqlDateKeyExpression(column: Prisma.Sql) {
  return Prisma.sql`to_char(((${column} AT TIME ZONE ${PLATFORM_SQL_UTC_TIMEZONE}) AT TIME ZONE ${PLATFORM_TIMEZONE})::date, 'YYYY-MM-DD')`;
}

function parseDateKey(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const normalized = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  return normalized === text ? text : '';
}

export function getPlatformDayRange(base = new Date(), dayOffset = 0) {
  const shifted = new Date(base.getTime() + PLATFORM_TIMEZONE_OFFSET_MS + dayOffset * DAY_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const startMs = Date.UTC(year, month, day) - PLATFORM_TIMEZONE_OFFSET_MS;
  const label = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    start: new Date(startMs),
    end: new Date(startMs + DAY_MS),
    label,
  };
}

export function getPlatformDateKey(date = new Date()) {
  return getPlatformDayRange(date).label;
}

export function getPlatformDateKeyRange(dateKey: string) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  const [year, month, day] = parsed.split('-').map(Number);
  const startMs = Date.UTC(year, month - 1, day) - PLATFORM_TIMEZONE_OFFSET_MS;
  return {
    start: new Date(startMs),
    end: new Date(startMs + DAY_MS),
  };
}

export function getPlatformDateRangeFilter(startDate: unknown, endDate: unknown) {
  const filter: Record<string, Date> = {};
  const startKey = parseDateKey(startDate);
  const endKey = parseDateKey(endDate);
  const startRange = startKey ? getPlatformDateKeyRange(startKey) : null;
  const endRange = endKey ? getPlatformDateKeyRange(endKey) : null;

  if (startRange) filter.gte = startRange.start;
  if (endRange) filter.lt = endRange.end;
  return filter;
}
