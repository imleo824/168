import prisma, { isDbConfigured } from '../db';
import { getTuiPlusStatus } from './tui-plus.service';
import {
  TUI_PLUS_SOURCE_SCOPE,
} from './tui-plus-source-claim.service';

const TUI_PLUS_ACTIVE_CHANNEL_STATUS = 'ACTIVE';
const TUI_PLUS_ACTIVE_STATUSES = ['TRIALING', 'ACTIVE'];
const TUI_PLUS_ENTITLEMENT_INTERVAL_MS = 5 * 60 * 1000;
const TUI_PLUS_ENTITLEMENT_INITIAL_DELAY_MS = 20 * 1000;

let stopAutoMaintenance: (() => void) | null = null;

function normalizeUserId(userId?: string | null) {
  return typeof userId === 'string' ? userId.trim() : '';
}

async function enableActiveTuiPlusSourcesForUser(userId: string) {
  const now = new Date();
  const enabled = await prisma.$executeRaw`
    UPDATE "AutoCrawlSource" AS source
    SET "disabled" = false,
        "updatedAt" = ${now}
    FROM "TuiPlusTelegramChannel" AS channel
    WHERE source."id" = channel."sourceId"
      AND source."ownerUserId" = ${userId}
      AND source."sourceScope" = ${TUI_PLUS_SOURCE_SCOPE}
      AND channel."userId" = ${userId}
      AND channel."status" = ${TUI_PLUS_ACTIVE_CHANNEL_STATUS}
      AND COALESCE(channel."autoPostEnabled", false) = true
  `;
  const disabled = await prisma.$executeRaw`
    UPDATE "AutoCrawlSource" AS source
    SET "disabled" = true,
        "updatedAt" = ${now}
    FROM "TuiPlusTelegramChannel" AS channel
    WHERE source."id" = channel."sourceId"
      AND source."ownerUserId" = ${userId}
      AND source."sourceScope" = ${TUI_PLUS_SOURCE_SCOPE}
      AND channel."userId" = ${userId}
      AND COALESCE(channel."autoPostEnabled", false) = false
      AND source."disabled" = false
  `;
  return Number(enabled || 0) + Number(disabled || 0);
}

async function disableTuiPlusSourcesForUser(userId: string) {
  const now = new Date();
  const result = await prisma.$executeRaw`
    UPDATE "AutoCrawlSource"
    SET "disabled" = true,
        "updatedAt" = ${now}
    WHERE "ownerUserId" = ${userId}
      AND "sourceScope" = ${TUI_PLUS_SOURCE_SCOPE}
      AND "disabled" = false
  `;
  return Number(result || 0);
}

async function expireActiveSubscriptionsForUser(userId: string) {
  const now = new Date();
  const result = await prisma.$executeRaw`
    UPDATE "TuiPlusSubscription"
    SET "status" = 'EXPIRED',
        "updatedAt" = ${now}
    WHERE "userId" = ${userId}
      AND "status" IN (${TUI_PLUS_ACTIVE_STATUSES[0]}, ${TUI_PLUS_ACTIVE_STATUSES[1]})
      AND "expiresAt" <= ${now}
  `;
  return Number(result || 0);
}

async function markTuiPlusUserExpired(userId: string) {
  const now = new Date();
  const result = await prisma.$executeRaw`
    UPDATE "User"
    SET "plusStatus" = 'EXPIRED',
        "updatedAt" = ${now}
    WHERE "id" = ${userId}
      AND "plusStatus" IN (${TUI_PLUS_ACTIVE_STATUSES[0]}, ${TUI_PLUS_ACTIVE_STATUSES[1]})
      AND "plusExpiresAt" IS NOT NULL
      AND "plusExpiresAt" <= ${now}
  `;
  return Number(result || 0);
}

export async function syncTuiPlusEntitlementsForUser(userId?: string | null) {
  const cleanUserId = normalizeUserId(userId);
  if (!cleanUserId || !isDbConfigured()) return { changedSources: 0, changedUsers: 0, changedSubscriptions: 0, releasedPlatformSources: 0, active: false };
  const status = await getTuiPlusStatus(cleanUserId);
  const changedUsers = status.active ? 0 : await markTuiPlusUserExpired(cleanUserId);
  const changedSubscriptions = status.active ? 0 : await expireActiveSubscriptionsForUser(cleanUserId);
  const changedSources = status.active
    ? await enableActiveTuiPlusSourcesForUser(cleanUserId)
    : await disableTuiPlusSourcesForUser(cleanUserId);

  return { changedSources, changedUsers, changedSubscriptions, releasedPlatformSources: 0, active: status.active };
}

export async function syncExpiredTuiPlusEntitlements() {
  if (!isDbConfigured()) return { changedSources: 0, changedUsers: 0, changedSubscriptions: 0, releasedPlatformSources: 0 };
  const now = new Date();
  const expiredUsers = await prisma.$executeRaw`
    UPDATE "User"
    SET "plusStatus" = 'EXPIRED',
        "updatedAt" = ${now}
    WHERE "plusStatus" IN (${TUI_PLUS_ACTIVE_STATUSES[0]}, ${TUI_PLUS_ACTIVE_STATUSES[1]})
      AND "plusExpiresAt" IS NOT NULL
      AND "plusExpiresAt" <= ${now}
  `;
  const expiredSubscriptions = await prisma.$executeRaw`
    UPDATE "TuiPlusSubscription"
    SET "status" = 'EXPIRED',
        "updatedAt" = ${now}
    WHERE "status" IN (${TUI_PLUS_ACTIVE_STATUSES[0]}, ${TUI_PLUS_ACTIVE_STATUSES[1]})
      AND "expiresAt" <= ${now}
  `;
  const disabledSources = await prisma.$executeRaw`
    UPDATE "AutoCrawlSource" AS source
    SET "disabled" = true,
        "updatedAt" = ${now}
    FROM "User" AS owner
    WHERE source."ownerUserId" = owner."id"
      AND source."sourceScope" = ${TUI_PLUS_SOURCE_SCOPE}
      AND source."disabled" = false
      AND (
        owner."plusExpiresAt" IS NULL
        OR owner."plusExpiresAt" <= ${now}
        OR owner."plusStatus" NOT IN (${TUI_PLUS_ACTIVE_STATUSES[0]}, ${TUI_PLUS_ACTIVE_STATUSES[1]})
        OR owner."plusStatus" IS NULL
      )
  `;

  return {
    changedSources: Number(disabledSources || 0),
    changedUsers: Number(expiredUsers || 0),
    changedSubscriptions: Number(expiredSubscriptions || 0),
    releasedPlatformSources: 0,
  };
}

export function startTuiPlusEntitlementMaintenance() {
  if (!isDbConfigured()) return () => {};

  let stopped = false;
  const run = () => {
    if (stopped) return;
    void syncExpiredTuiPlusEntitlements()
      .then((result) => {
        if (result.changedSources > 0 || result.changedUsers > 0 || result.changedSubscriptions > 0) {
          console.log(`[tui-plus] expired ${result.changedUsers} member user(s), expired ${result.changedSubscriptions} subscription(s), stopped ${result.changedSources} member source sync(s).`);
        }
      })
      .catch((error) => {
        console.warn('[tui-plus] entitlement maintenance failed:', error?.message || error);
      });
  };

  const initialTimer = setTimeout(run, TUI_PLUS_ENTITLEMENT_INITIAL_DELAY_MS);
  initialTimer.unref?.();
  const interval = setInterval(run, TUI_PLUS_ENTITLEMENT_INTERVAL_MS);
  interval.unref?.();

  return () => {
    stopped = true;
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
}

export function ensureTuiPlusEntitlementMaintenanceStarted() {
  if (stopAutoMaintenance || process.env.DISABLE_TUI_PLUS_ENTITLEMENT_MAINTENANCE === '1' || process.env.NODE_ENV === 'test') {
    return stopAutoMaintenance || (() => {});
  }
  stopAutoMaintenance = startTuiPlusEntitlementMaintenance();
  return stopAutoMaintenance;
}

ensureTuiPlusEntitlementMaintenanceStarted();
