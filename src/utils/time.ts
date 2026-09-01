import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

const RELATIVE_TIME_PREFIX_PATTERN = /^(?:大约|不到|少于)\s*/;

function normalizeRelativeTime(value: string) {
  return value.replace(RELATIVE_TIME_PREFIX_PATTERN, '').replace(/\s+/g, ' ').trim();
}

export function formatRelativeTime(dateValue: unknown) {
  if (!dateValue) return '刚刚';

  try {
    const date = new Date(dateValue as any);
    if (Number.isNaN(date.getTime())) return '刚刚';
    return normalizeRelativeTime(formatDistanceToNow(date, { addSuffix: true, locale: zhCN }));
  } catch {
    return '刚刚';
  }
}
