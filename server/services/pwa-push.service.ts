import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';

export type PwaPushType = 'LIKE' | 'COMMENT' | 'QUOTE' | 'FOLLOW' | 'SYSTEM' | 'RECHARGE' | 'PROMOTION';

export type PwaPushPayload = {
  title: string;
  body: string;
  targetUrl?: string;
  type: PwaPushType;
  notificationId?: string;
  badgeCount?: number;
};

type NotificationPreference = {
  userId: string;
  pushEnabled: boolean;
  followEnabled: boolean;
  commentEnabled: boolean;
  quoteEnabled: boolean;
  likeEnabled: boolean;
  systemEnabled: boolean;
  rechargeEnabled: boolean;
  promotionEnabled: boolean;
};

type WebPushSubscriptionRow = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  isActive: boolean;
};

type PushDeliveryStatus = 'PENDING' | 'SENT' | 'SKIPPED' | 'FAILED';

type QueueDeliveryParams = PwaPushPayload & {
  userId: string;
  eventKey: string;
};

const DEFAULT_PUSH_TITLE = '推推';
const DEFAULT_TARGET_URL = '/messages';
const PUSH_CONFIG_LOG_KEY = Symbol.for('tuitui.pwaPushConfigWarning');
const PUSH_BODY_MAX_LENGTH = 140;
const PUSH_TITLE_MAX_LENGTH = 60;
const PUSH_TARGET_MAX_LENGTH = 512;
const WEB_PUSH_RECORD_SIZE = 4096;
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';
const POSTGRES_UNIQUE_VIOLATION = '23505';


function truncateText(value: unknown, maxLength: number) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…` : text;
}

function getDatabaseErrorCode(error: unknown) {
  const anyError = error as any;
  return String(anyError?.code || anyError?.meta?.code || anyError?.cause?.code || anyError?.message || '');
}

function isSoftQueueFailure(error: unknown) {
  const code = getDatabaseErrorCode(error);
  return code.includes(POSTGRES_FOREIGN_KEY_VIOLATION) || code.includes(POSTGRES_UNIQUE_VIOLATION);
}

function normalizeTargetUrl(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return DEFAULT_TARGET_URL;
  if (!raw.startsWith('/')) return DEFAULT_TARGET_URL;
  if (raw.startsWith('//')) return DEFAULT_TARGET_URL;
  return raw.slice(0, PUSH_TARGET_MAX_LENGTH) || DEFAULT_TARGET_URL;
}

function normalizePushType(value: unknown): PwaPushType {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (['LIKE', 'COMMENT', 'QUOTE', 'FOLLOW', 'SYSTEM', 'RECHARGE', 'PROMOTION'].includes(raw)) return raw as PwaPushType;
  return 'SYSTEM';
}

function getWebPushConfig() {
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim();
  const subject = String(process.env.WEB_PUSH_SUBJECT || process.env.APP_URL || 'mailto:admin@example.com').trim();
  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey() {
  return getWebPushConfig().publicKey;
}

export function hasWebPushConfig() {
  const { publicKey, privateKey } = getWebPushConfig();
  return Boolean(publicKey && privateKey);
}

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

function hmacSha256(key: Buffer, data: Buffer) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number) {
  const chunks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  let counter = 1;
  while (Buffer.concat(chunks).length < length) {
    previous = hmacSha256(prk, Buffer.concat([previous, info, Buffer.from([counter])]));
    chunks.push(previous);
    counter += 1;
  }
  return Buffer.concat(chunks).subarray(0, length);
}

function derIntegerToJose(value: Buffer) {
  let normalized = value;
  while (normalized.length > 0 && normalized[0] === 0) normalized = normalized.subarray(1);
  if (normalized.length > 32) normalized = normalized.subarray(normalized.length - 32);
  if (normalized.length < 32) normalized = Buffer.concat([Buffer.alloc(32 - normalized.length), normalized]);
  return normalized;
}

function derSignatureToJose(derSignature: Buffer) {
  let offset = 0;
  if (derSignature[offset] !== 0x30) throw new Error('Invalid ES256 signature sequence.');
  offset += 1;
  const firstLengthByte = derSignature[offset];
  const sequenceLength = firstLengthByte & 0x80 ? derSignature[offset + 1] : firstLengthByte;
  offset += firstLengthByte & 0x80 ? 2 : 1;
  if (sequenceLength <= 0 || offset >= derSignature.length) throw new Error('Invalid ES256 signature length.');
  if (derSignature[offset] !== 0x02) throw new Error('Invalid ES256 signature r marker.');
  offset += 1;
  const rLength = derSignature[offset];
  offset += 1;
  const r = derSignature.subarray(offset, offset + rLength);
  offset += rLength;
  if (derSignature[offset] !== 0x02) throw new Error('Invalid ES256 signature s marker.');
  offset += 1;
  const sLength = derSignature[offset];
  offset += 1;
  const s = derSignature.subarray(offset, offset + sLength);
  return Buffer.concat([derIntegerToJose(r), derIntegerToJose(s)]);
}

function createVapidAuthorizationHeader(endpoint: string) {
  const { publicKey, privateKey, subject } = getWebPushConfig();
  const publicKeyBuffer = base64UrlDecode(publicKey);
  const privateKeyBuffer = base64UrlDecode(privateKey);
  if (publicKeyBuffer.length !== 65 || publicKeyBuffer[0] !== 0x04 || privateKeyBuffer.length !== 32) {
    throw new Error('VAPID key 格式不正确');
  }

  const endpointUrl = new URL(endpoint);
  const aud = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(publicKeyBuffer.subarray(1, 33)),
    y: base64UrlEncode(publicKeyBuffer.subarray(33, 65)),
    d: base64UrlEncode(privateKeyBuffer),
  };
  const keyObject = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const header = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = base64UrlEncode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject }));
  const signingInput = `${header}.${payload}`;
  const derSignature = crypto.sign('sha256', Buffer.from(signingInput), keyObject);
  const signature = base64UrlEncode(derSignatureToJose(derSignature));
  return `vapid t=${signingInput}.${signature}, k=${publicKey}`;
}

function encryptWebPushPayload(subscription: WebPushSubscriptionRow, payload: string) {
  const receiverPublicKey = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  if (receiverPublicKey.length !== 65 || receiverPublicKey[0] !== 0x04) {
    throw new Error('订阅公钥格式不正确');
  }

  const sender = crypto.createECDH('prime256v1');
  sender.generateKeys();
  const senderPublicKey = sender.getPublicKey();
  const sharedSecret = sender.computeSecret(receiverPublicKey);
  const salt = crypto.randomBytes(16);

  const prkKey = hmacSha256(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), receiverPublicKey, senderPublicKey]);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);
  const prk = hmacSha256(salt, ikm);
  const contentEncryptionKey = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);

  const plainText = Buffer.concat([Buffer.from(payload), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', contentEncryptionKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plainText), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(WEB_PUSH_RECORD_SIZE, 0);
  const keyLength = Buffer.from([senderPublicKey.length]);
  return Buffer.concat([salt, recordSize, keyLength, senderPublicKey, encrypted]);
}

async function sendEncryptedWebPush(subscription: WebPushSubscriptionRow, payload: string, type: PwaPushType) {
  const encryptedPayload = encryptWebPushPayload(subscription, payload);
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: createVapidAuthorizationHeader(subscription.endpoint),
      TTL: String(60 * 60 * 24),
      Urgency: type === 'SYSTEM' ? 'normal' : 'high',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
    },
    body: encryptedPayload as any,
  });
  if (!response.ok) {
    const error = new Error(`web_push_${response.status}`) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }
}

function warnMissingWebPushConfigOnce() {
  const globalState = globalThis as any;
  if (!globalState[PUSH_CONFIG_LOG_KEY]) {
    globalState[PUSH_CONFIG_LOG_KEY] = true;
    console.warn('[pwa-push] WEB_PUSH_VAPID_PUBLIC_KEY or WEB_PUSH_VAPID_PRIVATE_KEY is missing; push delivery is disabled.');
  }
}

async function ensurePreferenceRow(userId: string) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "NotificationPreference" ("userId")
    VALUES (${userId})
    ON CONFLICT ("userId") DO NOTHING
  `);
}

export async function getNotificationPreference(userId: string): Promise<NotificationPreference> {
  await ensurePreferenceRow(userId);
  const rows = await prisma.$queryRaw<NotificationPreference[]>(Prisma.sql`
    SELECT "userId", "pushEnabled", "followEnabled", "commentEnabled", "quoteEnabled", "likeEnabled", "systemEnabled", "rechargeEnabled", "promotionEnabled"
    FROM "NotificationPreference"
    WHERE "userId" = ${userId}
    LIMIT 1
  `);
  return rows[0] || {
    userId,
    pushEnabled: false,
    followEnabled: true,
    commentEnabled: true,
    quoteEnabled: true,
    likeEnabled: false,
    systemEnabled: true,
    rechargeEnabled: true,
    promotionEnabled: true,
  };
}

export async function updateNotificationPreference(userId: string, patch: Partial<Omit<NotificationPreference, 'userId'>>) {
  await ensurePreferenceRow(userId);
  const current = await getNotificationPreference(userId);
  const next = {
    pushEnabled: typeof patch.pushEnabled === 'boolean' ? patch.pushEnabled : current.pushEnabled,
    followEnabled: typeof patch.followEnabled === 'boolean' ? patch.followEnabled : current.followEnabled,
    commentEnabled: typeof patch.commentEnabled === 'boolean' ? patch.commentEnabled : current.commentEnabled,
    quoteEnabled: typeof patch.quoteEnabled === 'boolean' ? patch.quoteEnabled : current.quoteEnabled,
    likeEnabled: typeof patch.likeEnabled === 'boolean' ? patch.likeEnabled : current.likeEnabled,
    systemEnabled: typeof patch.systemEnabled === 'boolean' ? patch.systemEnabled : current.systemEnabled,
    rechargeEnabled: typeof patch.rechargeEnabled === 'boolean' ? patch.rechargeEnabled : current.rechargeEnabled,
    promotionEnabled: typeof patch.promotionEnabled === 'boolean' ? patch.promotionEnabled : current.promotionEnabled,
  };

  const rows = await prisma.$queryRaw<NotificationPreference[]>(Prisma.sql`
    UPDATE "NotificationPreference"
    SET
      "pushEnabled" = ${next.pushEnabled},
      "followEnabled" = ${next.followEnabled},
      "commentEnabled" = ${next.commentEnabled},
      "quoteEnabled" = ${next.quoteEnabled},
      "likeEnabled" = ${next.likeEnabled},
      "systemEnabled" = ${next.systemEnabled},
      "rechargeEnabled" = ${next.rechargeEnabled},
      "promotionEnabled" = ${next.promotionEnabled},
      "updatedAt" = now()
    WHERE "userId" = ${userId}
    RETURNING "userId", "pushEnabled", "followEnabled", "commentEnabled", "quoteEnabled", "likeEnabled", "systemEnabled", "rechargeEnabled", "promotionEnabled"
  `);
  return rows[0];
}

export async function saveWebPushSubscription(params: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  platform?: string | null;
}) {
  const id = crypto.randomUUID();
  const endpoint = truncateText(params.endpoint, 4096);
  const p256dh = truncateText(params.p256dh, 512);
  const auth = truncateText(params.auth, 512);
  const userAgent = truncateText(params.userAgent, 512) || null;
  const platform = truncateText(params.platform, 80) || null;

  if (!endpoint || !p256dh || !auth) {
    throw new Error('推送订阅信息不完整');
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "WebPushSubscription" ("id", "userId", "endpoint", "p256dh", "auth", "userAgent", "platform", "isActive", "createdAt", "updatedAt")
    VALUES (${id}, ${params.userId}, ${endpoint}, ${p256dh}, ${auth}, ${userAgent}, ${platform}, true, now(), now())
    ON CONFLICT ("endpoint") DO UPDATE SET
      "userId" = EXCLUDED."userId",
      "p256dh" = EXCLUDED."p256dh",
      "auth" = EXCLUDED."auth",
      "userAgent" = EXCLUDED."userAgent",
      "platform" = EXCLUDED."platform",
      "isActive" = true,
      "updatedAt" = now()
  `);

  await updateNotificationPreference(params.userId, { pushEnabled: true });
  return getPushStatus(params.userId);
}

export async function deactivateWebPushSubscription(userId: string, endpoint?: string | null) {
  const normalizedEndpoint = truncateText(endpoint, 4096);
  if (normalizedEndpoint) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "WebPushSubscription"
      SET "isActive" = false, "updatedAt" = now()
      WHERE "userId" = ${userId} AND "endpoint" = ${normalizedEndpoint}
    `);
  } else {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "WebPushSubscription"
      SET "isActive" = false, "updatedAt" = now()
      WHERE "userId" = ${userId}
    `);
  }

  const activeRows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM "WebPushSubscription"
    WHERE "userId" = ${userId} AND "isActive" = true
  `);
  if ((activeRows[0]?.count || 0) <= 0) {
    await updateNotificationPreference(userId, { pushEnabled: false });
  }
  return getPushStatus(userId);
}

export async function getPushStatus(userId: string) {
  const preference = await getNotificationPreference(userId);
  const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM "WebPushSubscription"
    WHERE "userId" = ${userId} AND "isActive" = true
  `);
  return {
    configured: hasWebPushConfig(),
    vapidPublicKey: getVapidPublicKey(),
    activeSubscriptionCount: rows[0]?.count || 0,
    preference,
  };
}

function isAllowedByPreference(type: PwaPushType, preference: NotificationPreference) {
  if (!preference.pushEnabled) return false;
  if (type === 'FOLLOW') return preference.followEnabled;
  if (type === 'COMMENT') return preference.commentEnabled;
  if (type === 'QUOTE') return preference.quoteEnabled;
  if (type === 'LIKE') return preference.likeEnabled;
  if (type === 'RECHARGE') return preference.rechargeEnabled;
  if (type === 'PROMOTION') return preference.promotionEnabled;
  return preference.systemEnabled;
}

async function getActiveSubscriptions(userId: string) {
  return prisma.$queryRaw<WebPushSubscriptionRow[]>(Prisma.sql`
    SELECT "id", "userId", "endpoint", "p256dh", "auth", "isActive"
    FROM "WebPushSubscription"
    WHERE "userId" = ${userId} AND "isActive" = true
  `);
}

async function markSubscriptionInactive(endpoint: string) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "WebPushSubscription"
    SET "isActive" = false, "updatedAt" = now()
    WHERE "endpoint" = ${endpoint}
  `);
}

export async function sendWebPushToUser(userId: string, payload: PwaPushPayload) {
  if (!hasWebPushConfig()) {
    warnMissingWebPushConfigOnce();
    return { sent: 0, skipped: true, reason: 'missing_config' };
  }

  const type = normalizePushType(payload.type);
  const preference = await getNotificationPreference(userId);
  if (!isAllowedByPreference(type, preference)) return { sent: 0, skipped: true, reason: 'preference_disabled' };

  const subscriptions = await getActiveSubscriptions(userId);
  if (subscriptions.length === 0) return { sent: 0, skipped: true, reason: 'no_active_subscription' };

  const body = truncateText(payload.body, PUSH_BODY_MAX_LENGTH);
  const title = truncateText(payload.title || DEFAULT_PUSH_TITLE, PUSH_TITLE_MAX_LENGTH) || DEFAULT_PUSH_TITLE;
  const targetUrl = normalizeTargetUrl(payload.targetUrl);
  const notificationPayload = JSON.stringify({
    title,
    body,
    targetUrl,
    type,
    notificationId: payload.notificationId || '',
    badgeCount: Number.isFinite(Number(payload.badgeCount)) ? Number(payload.badgeCount) : undefined,
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
  });

  let sent = 0;
  const errors: string[] = [];
  await Promise.all(subscriptions.map(async (row) => {
    try {
      await sendEncryptedWebPush(row, notificationPayload, type);
      sent += 1;
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || error?.status || 0);
      if (statusCode === 404 || statusCode === 410) {
        await markSubscriptionInactive(row.endpoint);
        return;
      }
      errors.push(truncateText(error?.message || error, 180));
    }
  }));

  return {
    sent,
    skipped: false,
    reason: errors.length ? errors.join('; ') : '',
  };
}

async function updateDeliveryStatus(eventKey: string, status: PushDeliveryStatus, error?: string) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "WebPushDelivery"
    SET "status" = ${status}, "error" = ${error || null}, "sentAt" = ${status === 'SENT' ? new Date() : null}, "updatedAt" = now()
    WHERE "eventKey" = ${eventKey}
  `);
}

export async function queueWebPushDelivery(params: QueueDeliveryParams) {
  if (!params.userId || !params.eventKey) return { queued: false, sent: 0, reason: 'invalid_params' };
  if (!hasWebPushConfig()) {
    warnMissingWebPushConfigOnce();
    return { queued: false, sent: 0, skipped: true, reason: 'missing_config' };
  }

  const id = crypto.randomUUID();
  const type = normalizePushType(params.type);
  const title = truncateText(params.title || DEFAULT_PUSH_TITLE, PUSH_TITLE_MAX_LENGTH) || DEFAULT_PUSH_TITLE;
  const body = truncateText(params.body, PUSH_BODY_MAX_LENGTH);
  if (!body) return { queued: false, sent: 0, reason: 'empty_body' };
  const targetUrl = normalizeTargetUrl(params.targetUrl);

  let inserted = 0;
  try {
    inserted = Number(await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "WebPushDelivery" ("id", "userId", "eventKey", "type", "title", "body", "targetUrl", "status", "createdAt", "updatedAt")
      VALUES (${id}, ${params.userId}, ${params.eventKey}, ${type}, ${title}, ${body}, ${targetUrl}, 'PENDING', now(), now())
      ON CONFLICT ("eventKey") DO NOTHING
    `));
  } catch (error) {
    if (isSoftQueueFailure(error)) return { queued: false, sent: 0, reason: 'stale_user_or_duplicate' };
    throw error;
  }
  if (inserted <= 0) return { queued: false, sent: 0, reason: 'duplicate' };

  const result = await sendWebPushToUser(params.userId, {
    title,
    body,
    targetUrl,
    type,
    notificationId: id,
    badgeCount: params.badgeCount,
  });

  if (result.skipped) {
    await updateDeliveryStatus(params.eventKey, 'SKIPPED', result.reason);
  } else if (result.sent > 0) {
    await updateDeliveryStatus(params.eventKey, 'SENT');
  } else {
    await updateDeliveryStatus(params.eventKey, 'FAILED', result.reason || 'send_failed');
  }

  return { queued: true, ...result };
}
