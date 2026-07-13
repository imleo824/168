const ONLINE_COUNT_REFRESH_MS = 30_000;

export const ONLINE_COUNT_REFRESH_INTERVAL_MS = ONLINE_COUNT_REFRESH_MS;

function getBeijingHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hourValue = parts.find((part) => part.type === "hour")?.value;
  const hour = Number(hourValue || date.getUTCHours() + 8);
  return ((hour % 24) + 24) % 24;
}

export function buildOnlineCount(minValue?: number, maxValue?: number, now = new Date()) {
  const min = Math.max(0, Math.round(Number(minValue ?? 380)));
  const max = Math.max(min, Math.round(Number(maxValue ?? 6800)));
  const span = Math.max(1, max - min);
  const hour = getBeijingHour(now);
  const isPeak = hour >= 8 || hour < 3;
  const base = isPeak ? max - span * 0.08 : min + span * 0.08;
  const jitterRange = Math.max(6, Math.round(span * (isPeak ? 0.045 : 0.035)));
  const bucket = Math.floor(now.getTime() / ONLINE_COUNT_REFRESH_MS);
  const seed = Math.sin(bucket * 12.9898 + min * 0.37 + max * 0.13) * 43758.5453;
  const normalized = seed - Math.floor(seed);
  const jitter = Math.round((normalized - 0.5) * 2 * jitterRange);

  return Math.min(max, Math.max(min, Math.round(base + jitter)));
}

export function formatOnlineCount(count: number) {
  return count.toLocaleString("zh-CN");
}

export function formatOptionalOnlineCount(count?: number | null) {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return '';
  return formatOnlineCount(count);
}
