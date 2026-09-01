function normalizeCount(value?: number | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function trimDecimal(value: number, digits: number) {
  return value
    .toFixed(digits)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
}

function trimCompactDecimal(value: number, digits: number) {
  const factor = 10 ** digits;
  return trimDecimal(Math.floor(value * factor) / factor, digits);
}

export function formatEngagementCount(value?: number | null) {
  const count = normalizeCount(value);
  if (count <= 0) return '';
  if (count >= 1000000000) return `${trimDecimal(count / 1000000000, count < 10000000000 ? 1 : 0)}B`;
  if (count >= 1000000) return `${trimDecimal(count / 1000000, count < 10000000 ? 1 : 0)}M`;
  if (count >= 1000) return `${trimDecimal(count / 1000, count < 10000 ? 1 : 0)}K`;
  return String(count);
}

export function formatCompactChineseEngagementCount(value?: number | null) {
  const count = normalizeCount(value);
  if (count <= 0) return '';
  if (count < 10000) return String(count);
  if (count < 100000000) return `${trimCompactDecimal(count / 10000, count < 100000 ? 1 : 0)}万`;
  return `${trimCompactDecimal(count / 100000000, count < 1000000000 ? 1 : 0)}亿`;
}
