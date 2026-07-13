import crypto from 'crypto';

import prisma, { isDbConfigured } from '../db';
import { getTuiPlusPlans, TuiPlusError } from './tui-plus.service';

type ContactKind = 'telegram' | 'whatsapp' | 'line';

type ContactInput = {
  contact?: unknown;
  value?: unknown;
  label?: unknown;
  title?: unknown;
  contactKind?: unknown;
  kind?: unknown;
  type?: unknown;
};

const TYPED_CONTACT_STATUS = { ACTIVE: 'ACTIVE', PAUSED: 'PAUSED', EXPIRED: 'EXPIRED', FAILED: 'FAILED' } as const;
const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  line: 'Line',
};
const TUI_PLUS_ACTIVE_STATUSES = new Set(['TRIALING', 'ACTIVE']);

function cleanString(raw: unknown, max = 120) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeExplicitKind(raw: unknown): ContactKind | null {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'telegram' || value === 'tg') return 'telegram';
  if (value === 'whatsapp' || value === 'whats_app' || value === 'wa') return 'whatsapp';
  if (value === 'line') return 'line';
  return null;
}

function inferContactKind(raw: unknown): ContactKind | null {
  const value = String(raw || '').trim();
  const normalized = value.toLowerCase();
  if (/telegram|纸飞机|\btg\b/.test(normalized) || /(?:t\.me|telegram\.me)\//i.test(value) || /^@[a-zA-Z]/.test(value)) return 'telegram';
  if (/whatsapp|whats app|\bwa\b/.test(normalized) || /(?:wa\.me|whatsapp\.com)\//i.test(value)) return 'whatsapp';
  if (/\bline\b/.test(normalized) || /line\.me\//i.test(value)) return 'line';
  return null;
}

function inferKindFromContactRow(row: any): ContactKind | null {
  return normalizeExplicitKind(row?.contactKind || row?.kind || row?.type) || inferContactKind(row?.label) || inferContactKind(row?.contactUrl) || inferContactKind(row?.contact);
}

function getTelegramHandle(value: string) {
  const fromUrl = value.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?([^/?#]+)/i)?.[1];
  return (fromUrl || value).replace(/^@+/, '').trim();
}

function getLineId(value: string) {
  const raw = value.trim();
  const fromUrl = raw.match(/^(?:https?:\/\/)?(?:www\.)?line\.me\/ti\/p\/~?([^/?#]+)/i)?.[1];
  return (fromUrl || raw).replace(/^@+/, '').trim();
}

function normalizeWhatsAppValue(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  const fromUrl = raw.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)([0-9+]+)/i)?.[1];
  const digits = (fromUrl || raw).replace(/[^0-9]/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  return `+${digits}`;
}

function normalizeTypedContactValue(kind: ContactKind, rawValue: unknown) {
  const value = cleanString(rawValue, 120);
  if (!value) return '';

  if (kind === 'telegram') {
    const handle = getTelegramHandle(value);
    return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(handle) ? `@${handle}` : '';
  }

  if (kind === 'whatsapp') {
    return normalizeWhatsAppValue(value);
  }

  const lineId = getLineId(value);
  return /^[A-Za-z0-9._-]{3,50}$/.test(lineId) ? lineId : '';
}

function contactUrlForKind(kind: ContactKind, contact: string) {
  if (kind === 'telegram') return `https://t.me/${contact.replace(/^@+/, '')}`;
  if (kind === 'whatsapp') return `https://wa.me/${contact.replace(/[^0-9]/g, '')}`;
  if (kind === 'line') return `https://line.me/ti/p/~${contact.replace(/^@+/, '')}`;
  return null;
}

function normalizeTypedContactInput(input: ContactInput) {
  const explicitKind = normalizeExplicitKind(input.contactKind || input.kind || input.type);
  const labelKind = inferContactKind(input.label || input.title);
  const valueKind = inferContactKind(input.contact || input.value);
  const kind = explicitKind || labelKind || valueKind;
  if (!kind) throw new TuiPlusError(400, '联系方式类型不合法');

  const contact = normalizeTypedContactValue(kind, input.contact || input.value);
  if (!contact) {
    if (kind === 'telegram') throw new TuiPlusError(400, '请输入正确的 Telegram ID');
    if (kind === 'whatsapp') throw new TuiPlusError(400, '请输入正确的 WhatsApp');
    throw new TuiPlusError(400, '请输入正确的 Line ID');
  }

  return {
    kind,
    contact,
    label: CONTACT_KIND_LABEL[kind],
    contactUrl: contactUrlForKind(kind, contact),
  };
}

function isActiveTypedContact(contact: any) {
  const status = String(contact?.status || '').toUpperCase();
  return status !== TYPED_CONTACT_STATUS.EXPIRED && status !== TYPED_CONTACT_STATUS.FAILED;
}

function normalizePlan(raw: unknown) {
  const plan = String(raw || '').trim().toUpperCase();
  if (plan === 'YEARLY') return 'yearly';
  if (plan === 'MONTHLY') return 'monthly';
  return 'trial';
}

function isTuiPlusActiveUser(row: any) {
  const status = String(row?.plusStatus || '').trim().toUpperCase();
  const expiresAt = row?.plusExpiresAt ? new Date(row.plusExpiresAt).getTime() : 0;
  return Boolean(expiresAt && expiresAt > Date.now() && TUI_PLUS_ACTIVE_STATUSES.has(status));
}

function contactLimitForUserPlan(plans: Awaited<ReturnType<typeof getTuiPlusPlans>>, row: any) {
  const planKey = normalizePlan(row?.plusPlan) as 'trial' | 'monthly' | 'yearly';
  return Math.max(0, Number(plans[planKey]?.contactLimit || 0));
}

export async function upsertTuiPlusTypedContact(userId: string, input: ContactInput, contactId?: string) {
  if (!userId || !isDbConfigured()) throw new TuiPlusError(503, '数据库未配置');
  const normalized = normalizeTypedContactInput(input);
  const plans = await getTuiPlusPlans();

  return prisma.$transaction(async (tx) => {
    const userRows = await tx.$queryRaw<any[]>`
      SELECT "id", "isDisabled", "plusStatus", "plusPlan", "plusExpiresAt"
      FROM "User"
      WHERE "id" = ${userId}
      FOR UPDATE
    `;
    const user = userRows[0];
    if (!user) throw new TuiPlusError(404, '用户不存在');
    if (user.isDisabled) throw new TuiPlusError(403, '您的账号已被禁用，无法添加联系方式');
    if (!isTuiPlusActiveUser(user)) throw new TuiPlusError(403, '开通 Tui Plus 后才能添加联系方式');

    const contacts = await tx.$queryRaw<any[]>`SELECT "id", "contact", "contactUrl", "label", "status" FROM "TuiPlusContact" WHERE "userId" = ${userId} FOR UPDATE`;
    const activeContacts = contacts.filter(isActiveTypedContact);
    const contactLimit = contactLimitForUserPlan(plans, user);
    const current = contactId ? activeContacts.find((contact: any) => String(contact.id) === String(contactId)) : null;
    if (contactId && !current) throw new TuiPlusError(404, '联系方式不存在');

    const sameKind = activeContacts.find((contact: any) => inferKindFromContactRow(contact) === normalized.kind && String(contact.id) !== String(contactId || ''));
    const targetId = current?.id || sameKind?.id || crypto.randomUUID();
    const isCreatingNewSlot = !current && !sameKind;

    if (isCreatingNewSlot && activeContacts.length >= contactLimit) {
      throw new TuiPlusError(400, `当前套餐最多添加 ${contactLimit} 个联系方式`);
    }

    const duplicateRows = await tx.$queryRaw<any[]>`SELECT "id" FROM "TuiPlusContact" WHERE "userId" = ${userId} AND "contact" = ${normalized.contact} AND "id" <> ${targetId} LIMIT 1`;
    if (duplicateRows[0]) throw new TuiPlusError(409, '该联系方式已经添加过');

    if (current || sameKind) {
      await tx.$executeRaw`UPDATE "TuiPlusContact" SET "contact" = ${normalized.contact}, "contactUrl" = ${normalized.contactUrl}, "label" = ${normalized.label}, "status" = ${TYPED_CONTACT_STATUS.ACTIVE}, "updatedAt" = ${new Date()} WHERE "id" = ${targetId} AND "userId" = ${userId}`;
    } else {
      await tx.$executeRaw`INSERT INTO "TuiPlusContact" ("id", "userId", "contact", "contactUrl", "label", "status", "createdAt", "updatedAt") VALUES (${targetId}, ${userId}, ${normalized.contact}, ${normalized.contactUrl}, ${normalized.label}, ${TYPED_CONTACT_STATUS.ACTIVE}, ${new Date()}, ${new Date()})`;
    }

    const rows = await tx.$queryRaw<any[]>`SELECT "id", "contact", "contactUrl", "label", "status", "createdAt", "updatedAt" FROM "TuiPlusContact" WHERE "id" = ${targetId} AND "userId" = ${userId} LIMIT 1`;
    return rows[0];
  });
}
