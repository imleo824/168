import prisma, { isDbConfigured } from '../db';
import { TuiPlusError } from './tui-plus.service';

const REMOVED_WECHAT_PATTERN = /(?:wechat|weixin|微信|\bwx\b)/i;

function mergedContactText(value: unknown) {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return [row.label, row.title, row.contactKind, row.kind, row.type, row.contact, row.contactUrl, row.value]
    .map((item) => String(item || ''))
    .join(' ');
}

export function isRemovedTuiPlusWechatContact(value: unknown) {
  return REMOVED_WECHAT_PATTERN.test(mergedContactText(value));
}

export function assertSupportedTuiPlusContactInput(value: unknown) {
  if (isRemovedTuiPlusWechatContact(value)) {
    throw new TuiPlusError(400, 'Tui Plus 已不再支持微信联系方式');
  }
}

export function filterSupportedTuiPlusContacts<T>(contacts: T[]): T[] {
  return contacts.filter((contact) => !isRemovedTuiPlusWechatContact(contact));
}

export async function deleteRemovedTuiPlusWechatContacts(userId?: string | null) {
  if (!isDbConfigured()) return 0;
  const pattern = '(wechat|weixin|微信|(^|[^a-z0-9])wx([^a-z0-9]|$))';
  if (userId) {
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM "TuiPlusContact" WHERE "userId" = $1 AND lower(coalesce("label", '') || ' ' || coalesce("contact", '') || ' ' || coalesce("contactUrl", '')) ~ $2`,
      userId,
      pattern,
    ).catch(() => 0);
    return Number(result || 0);
  }
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM "TuiPlusContact" WHERE lower(coalesce("label", '') || ' ' || coalesce("contact", '') || ' ' || coalesce("contactUrl", '')) ~ $1`,
    pattern,
  ).catch(() => 0);
  return Number(result || 0);
}
