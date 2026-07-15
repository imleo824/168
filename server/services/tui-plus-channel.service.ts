import crypto from 'crypto';

import { ConfigService } from '../config.service';
import prisma, { isDbConfigured } from '../db';
import {
  TuiPlusError,
  getTuiPlusChannelLimitForPlan,
  getTuiPlusStatus,
} from './tui-plus.service';
import {
  TUI_PLUS_SOURCE_SCOPE,
  pauseOrReleaseTuiPlusSource,
  releaseOrDeleteTuiPlusSource,
} from './tui-plus-source-claim.service';

const TELEGRAM_CHANNEL_HANDLE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
const TUI_PLUS_CHANNEL_STATUS = { ACTIVE: 'ACTIVE', PAUSED: 'PAUSED', EXPIRED: 'EXPIRED' } as const;
const MEMBER_OWNED_SOURCE_MESSAGE = '该频道已被其他会员认领';
const TELEGRAM_CHANNEL_PROBE_MAX_BYTES = 512 * 1024;

function cleanString(raw: unknown, max = 80) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function stableId(input: string) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 24);
}

async function resolveDefaultCategoryName() {
  const configs = await ConfigService.getConfigs().catch(() => ConfigService.getDefaultConfigs());
  const schemas = Array.isArray(configs?.publish_category_schema) ? configs.publish_category_schema : [];
  const firstSchema = schemas.find((schema: any) => schema && typeof schema === 'object');
  return cleanString(firstSchema?.name || firstSchema?.slug || firstSchema?.categorySlug, 32) || 'default';
}

async function resolveCategoryName(raw: unknown, fallback?: unknown) {
  return cleanString(raw, 32) || cleanString(fallback, 32) || await resolveDefaultCategoryName();
}

function normalizeTelegramHandle(input: unknown) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const fromUrl = raw.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?([^/?#]+)/i)?.[1];
  const candidate = (fromUrl || raw).replace(/^@+/, '').trim();
  const clean = candidate.replace(/[^a-zA-Z0-9_]/g, '');
  return TELEGRAM_CHANNEL_HANDLE_PATTERN.test(clean) ? clean : '';
}

function canonicalTelegramChannelUrl(handle: string) {
  return `https://t.me/s/${handle}`;
}

function normalizeChannelTitle(raw: unknown, handle: string) {
  return cleanString(raw, 40) || `@${handle}`;
}

function normalizeAutoPostEnabled(raw: unknown) {
  return raw === true || raw === 'true' || raw === 1 || raw === '1';
}

function resolveAutoPostEnabled(input: any, fallback: unknown) {
  if (input && typeof input === 'object' && Object.prototype.hasOwnProperty.call(input, 'autoPostEnabled')) {
    return normalizeAutoPostEnabled(input.autoPostEnabled);
  }
  return Boolean(fallback);
}

function isMemberOwnedSource(source: any, currentUserId: string) {
  const scope = String(source?.sourceScope || '').trim().toUpperCase();
  const ownerUserId = String(source?.ownerUserId || '').trim();
  return scope === TUI_PLUS_SOURCE_SCOPE && ownerUserId && ownerUserId !== currentUserId;
}

async function assertNoOtherMemberChannelClaim(tx: any, params: { userId: string; handle: string; sourceId?: string | null }) {
  const rows = await tx.$queryRaw<any[]>`
    SELECT "id", "userId"
    FROM "TuiPlusTelegramChannel"
    WHERE "userId" <> ${params.userId}
      AND "status" IN (${TUI_PLUS_CHANNEL_STATUS.ACTIVE}, ${TUI_PLUS_CHANNEL_STATUS.PAUSED})
      AND COALESCE("autoPostEnabled", false) = true
      AND (
        "channelHandle" = ${params.handle}
        OR (${params.sourceId || null} IS NOT NULL AND "sourceId" = ${params.sourceId || null})
      )
    LIMIT 1
  `;
  if (rows[0]) throw new TuiPlusError(409, MEMBER_OWNED_SOURCE_MESSAGE);
}

async function findExistingAutoCrawlSource(crawlUrl: string) {
  const rows = await prisma.$queryRaw<any[]>`SELECT "id", "ownerUserId", "sourceScope" FROM "AutoCrawlSource" WHERE "source" = ${crawlUrl} LIMIT 1`;
  return rows[0] || null;
}

async function readLimitedText(response: Response, maxBytes = TELEGRAM_CHANNEL_PROBE_MAX_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return await response.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) throw new TuiPlusError(400, 'Telegram 频道响应过大，请确认链接是公开频道');
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function assertPublicTelegramChannelReachable(crawlUrl: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await fetch(crawlUrl, {
      method: 'GET',
      headers: { 'user-agent': 'Mozilla/5.0 TuiPlusBot/1.0 (+https://tuitui888.com)', accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      throw new TuiPlusError(400, 'Telegram 频道响应格式异常，请确认链接是公开频道');
    }
    const text = await readLimitedText(response);
    if (!response.ok || !/tgme_channel_info|tgme_widget_message|tgme_page|telegram/i.test(text)) {
      throw new TuiPlusError(400, 'Telegram 频道无法公开访问，请确认链接是公开频道');
    }
  } catch (error) {
    if (error instanceof TuiPlusError) throw error;
    throw new TuiPlusError(400, 'Telegram 频道暂时无法访问，请稍后重试');
  } finally {
    clearTimeout(timer);
  }
}

async function assertNewTelegramSourceReachable(crawlUrl: string) {
  const existingSource = await findExistingAutoCrawlSource(crawlUrl);
  if (!existingSource?.id) await assertPublicTelegramChannelReachable(crawlUrl);
  return existingSource;
}

async function countActiveChannels(tx: any, userId: string) {
  const rows = await tx.$queryRaw<any[]>`SELECT COUNT(*)::int AS count FROM "TuiPlusTelegramChannel" WHERE "userId" = ${userId} AND "status" IN ('ACTIVE', 'PAUSED')`;
  return Number(rows[0]?.count || 0);
}

async function claimAutoCrawlSource(tx: any, params: { userId: string; crawlUrl: string; handle: string; categoryName: string; title: string }) {
  // Existing posts are intentionally not updated; channel claims only affect future crawl sync.
  const now = new Date();
  const existingRows = await tx.$queryRaw<any[]>`SELECT * FROM "AutoCrawlSource" WHERE "source" = ${params.crawlUrl} LIMIT 1`;
  const existing = existingRows[0] || null;

  if (existing?.id) {
    if (isMemberOwnedSource(existing, params.userId)) throw new TuiPlusError(409, MEMBER_OWNED_SOURCE_MESSAGE);
    await assertNoOtherMemberChannelClaim(tx, { userId: params.userId, handle: params.handle, sourceId: existing.id });
    const categoryName = await resolveCategoryName(params.categoryName, existing.categoryName);

    // The original platform fields are snapshotted before member ownership takes over.
    await tx.$executeRaw`
      UPDATE "AutoCrawlSource"
      SET "disabled" = false,
          "sourceName" = ${cleanString(`Tui Plus ${params.title}`, 80)},
          "categoryName" = ${categoryName},
          "authorUserId" = ${params.userId},
          "ownerUserId" = ${params.userId},
          "sourceScope" = ${TUI_PLUS_SOURCE_SCOPE},
          "claimedFromAuthorUserId" = COALESCE(NULLIF("claimedFromAuthorUserId", ''), ${String(existing.authorUserId || '')}),
          "claimedFromSourceName" = COALESCE(NULLIF("claimedFromSourceName", ''), ${String(existing.sourceName || '')}),
          "claimedFromCategoryName" = COALESCE(NULLIF("claimedFromCategoryName", ''), ${String(existing.categoryName || '')}),
          "updatedAt" = ${now}
      WHERE "id" = ${existing.id}
    `;
    return existing.id;
  }

  await assertNoOtherMemberChannelClaim(tx, { userId: params.userId, handle: params.handle });
  const categoryName = await resolveCategoryName(params.categoryName);

  const sourceId = `plus_${stableId(`${params.userId}:${params.handle}`)}`;
  await tx.$executeRaw`
    INSERT INTO "AutoCrawlSource" ("id", "source", "type", "sourceName", "trustLevel", "categoryId", "categoryName", "authorUserId", "showContact", "disabled", "cursor", "cursorKind", "pollIntervalMinutes", "nextRunAt", "ownerUserId", "sourceScope", "createdAt", "updatedAt")
    VALUES (${sourceId}, ${params.crawlUrl}, 'telegram', ${cleanString(`Tui Plus ${params.title}`, 80)}, 'NORMAL', NULL, ${categoryName}, ${params.userId}, true, false, '', 'baseline_pending', 30, ${now}, ${params.userId}, ${TUI_PLUS_SOURCE_SCOPE}, ${now}, ${now})
  `;
  return sourceId;
}

export async function addTuiPlusTelegramChannel(userId: string, input: { channelUrl?: unknown; categoryName?: unknown; title?: unknown; label?: unknown; autoPostEnabled?: unknown }) {
  if (!userId || !isDbConfigured()) throw new TuiPlusError(503, '数据库未配置');

  const status = await getTuiPlusStatus(userId);
  if (!status.active) throw new TuiPlusError(403, '开通 Tui Plus 后才能添加 Telegram 频道');

  const handle = normalizeTelegramHandle(input.channelUrl);
  if (!handle) throw new TuiPlusError(400, '请输入正确的公开 Telegram 频道链接');

  const crawlUrl = canonicalTelegramChannelUrl(handle);
  await assertNewTelegramSourceReachable(crawlUrl);
  const title = normalizeChannelTitle(input.title || input.label, handle);
  const categoryName = await resolveCategoryName(input.categoryName);
  const autoPostEnabled = normalizeAutoPostEnabled(input.autoPostEnabled);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existingRows = await tx.$queryRaw<any[]>`SELECT "id", "sourceId" FROM "TuiPlusTelegramChannel" WHERE "userId" = ${userId} AND "channelHandle" = ${handle} LIMIT 1`;
    const limit = await getTuiPlusChannelLimitForPlan(status.plan);
    const currentCount = await countActiveChannels(tx, userId);
    if (!existingRows[0] && currentCount >= limit) throw new TuiPlusError(400, `会员主页最多添加 ${limit} 个 Telegram 频道`);

    const sourceId = autoPostEnabled
      ? await claimAutoCrawlSource(tx, { userId, crawlUrl, handle, categoryName, title })
      : null;
    if (!autoPostEnabled && existingRows[0]?.sourceId) {
      await pauseOrReleaseTuiPlusSource(tx, { sourceId: existingRows[0].sourceId, userId });
    }
    const channelId = existingRows[0]?.id || crypto.randomUUID();
    await tx.$executeRaw`
      INSERT INTO "TuiPlusTelegramChannel" ("id", "userId", "channelUrl", "channelHandle", "title", "sourceId", "autoPostEnabled", "status", "createdAt", "updatedAt")
      VALUES (${channelId}, ${userId}, ${crawlUrl}, ${handle}, ${title}, ${sourceId}, ${autoPostEnabled}, ${TUI_PLUS_CHANNEL_STATUS.ACTIVE}, ${now}, ${now})
      ON CONFLICT ("userId", "channelHandle") DO UPDATE SET
        "channelUrl" = EXCLUDED."channelUrl",
        "title" = EXCLUDED."title",
        "sourceId" = EXCLUDED."sourceId",
        "autoPostEnabled" = EXCLUDED."autoPostEnabled",
        "status" = ${TUI_PLUS_CHANNEL_STATUS.ACTIVE},
        "lastError" = NULL,
        "updatedAt" = EXCLUDED."updatedAt"
    `;

    const rows = await tx.$queryRaw<any[]>`SELECT "id", "channelUrl", "channelHandle", "title", "sourceId", COALESCE("autoPostEnabled", false) AS "autoPostEnabled", "status", "lastCrawledAt", "lastError", "createdAt", "updatedAt" FROM "TuiPlusTelegramChannel" WHERE "id" = ${channelId} LIMIT 1`;
    return rows[0];
  });
}

export async function updateTuiPlusTelegramChannel(userId: string, channelId: string, input: any) {
  if (!userId || !channelId || !isDbConfigured()) throw new TuiPlusError(404, '频道不存在');

  const statusOnly = typeof input !== 'object' || input === null || (Object.keys(input).length === 1 && Object.prototype.hasOwnProperty.call(input, 'status'));
  if (statusOnly) {
    const normalized = String(typeof input === 'object' && input ? input.status : input || '').trim().toUpperCase();
    if (normalized !== TUI_PLUS_CHANNEL_STATUS.ACTIVE && normalized !== TUI_PLUS_CHANNEL_STATUS.PAUSED) throw new TuiPlusError(400, '频道状态不合法');

    return prisma.$transaction(async (tx) => {
      const channelRows = await tx.$queryRaw<any[]>`SELECT "id", "channelUrl", "channelHandle", "title", "sourceId", COALESCE("autoPostEnabled", false) AS "autoPostEnabled" FROM "TuiPlusTelegramChannel" WHERE "id" = ${channelId} AND "userId" = ${userId} LIMIT 1`;
      const channel = channelRows[0];
      if (!channel) throw new TuiPlusError(404, '频道不存在');

      if (normalized === TUI_PLUS_CHANNEL_STATUS.ACTIVE && channel.autoPostEnabled) {
        const status = await getTuiPlusStatus(userId);
        if (!status.active) throw new TuiPlusError(403, '开通 Tui Plus 后才能启用频道');
        const handle = normalizeTelegramHandle(channel.channelUrl || channel.channelHandle);
        if (!handle) throw new TuiPlusError(400, '频道数据异常，请重新添加频道');
        const crawlUrl = canonicalTelegramChannelUrl(handle);
        const title = normalizeChannelTitle(channel.title, handle);
        const categoryName = await resolveCategoryName(null);
        const sourceId = await claimAutoCrawlSource(tx, { userId, crawlUrl, handle, categoryName, title });
        await tx.$executeRaw`UPDATE "TuiPlusTelegramChannel" SET "status" = ${normalized}, "sourceId" = ${sourceId}, "lastError" = NULL, "updatedAt" = ${new Date()} WHERE "id" = ${channelId} AND "userId" = ${userId}`;
      } else {
        // Expiry and pause only stop sync; the member-owned source is not released back to the platform pool.
        await tx.$executeRaw`UPDATE "TuiPlusTelegramChannel" SET "status" = ${normalized}, "updatedAt" = ${new Date()} WHERE "id" = ${channelId} AND "userId" = ${userId}`;
        await pauseOrReleaseTuiPlusSource(tx, { sourceId: channel.sourceId, userId });
      }

      const rows = await tx.$queryRaw<any[]>`SELECT "id", "sourceId" FROM "TuiPlusTelegramChannel" WHERE "id" = ${channelId} AND "userId" = ${userId} LIMIT 1`;
      return rows[0];
    });
  }

  const status = await getTuiPlusStatus(userId);
  if (!status.active) throw new TuiPlusError(403, '开通 Tui Plus 后才能编辑频道');

  const currentRows = await prisma.$queryRaw<any[]>`SELECT "id", "channelUrl", "channelHandle", "title", "sourceId", COALESCE("autoPostEnabled", false) AS "autoPostEnabled" FROM "TuiPlusTelegramChannel" WHERE "id" = ${channelId} AND "userId" = ${userId} LIMIT 1`;
  const current = currentRows[0];
  if (!current) throw new TuiPlusError(404, '频道不存在');

  const handle = normalizeTelegramHandle(input.channelUrl || input.url || current.channelUrl);
  if (!handle) throw new TuiPlusError(400, '请输入正确的公开 Telegram 频道链接');

  const crawlUrl = canonicalTelegramChannelUrl(handle);
  if (handle !== current.channelHandle) await assertNewTelegramSourceReachable(crawlUrl);
  const title = normalizeChannelTitle(input.title || input.label || current.title, handle);
  const categoryName = await resolveCategoryName(input.categoryName);
  const autoPostEnabled = resolveAutoPostEnabled(input, current.autoPostEnabled);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const duplicateRows = await tx.$queryRaw<any[]>`SELECT "id" FROM "TuiPlusTelegramChannel" WHERE "userId" = ${userId} AND "channelHandle" = ${handle} AND "id" <> ${channelId} LIMIT 1`;
    if (duplicateRows[0]) throw new TuiPlusError(409, '该频道已经添加过');

    const sourceId = autoPostEnabled
      ? await claimAutoCrawlSource(tx, { userId, crawlUrl, handle, categoryName, title })
      : null;
    if (current.sourceId && (current.sourceId !== sourceId || (handle !== current.channelHandle && !autoPostEnabled))) {
      await releaseOrDeleteTuiPlusSource(tx, { sourceId: current.sourceId, userId });
    }
    await tx.$executeRaw`UPDATE "TuiPlusTelegramChannel" SET "channelUrl" = ${crawlUrl}, "channelHandle" = ${handle}, "title" = ${title}, "sourceId" = ${sourceId}, "autoPostEnabled" = ${autoPostEnabled}, "status" = ${TUI_PLUS_CHANNEL_STATUS.ACTIVE}, "lastError" = NULL, "updatedAt" = ${now} WHERE "id" = ${channelId} AND "userId" = ${userId}`;

    const rows = await tx.$queryRaw<any[]>`SELECT "id", "channelUrl", "channelHandle", "title", "sourceId", COALESCE("autoPostEnabled", false) AS "autoPostEnabled", "status", "lastCrawledAt", "lastError", "createdAt", "updatedAt" FROM "TuiPlusTelegramChannel" WHERE "id" = ${channelId} LIMIT 1`;
    return rows[0];
  });
}

export async function deleteTuiPlusTelegramChannel(userId: string, channelId: string) {
  if (!userId || !channelId || !isDbConfigured()) throw new TuiPlusError(404, '频道不存在');

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<any[]>`DELETE FROM "TuiPlusTelegramChannel" WHERE "id" = ${channelId} AND "userId" = ${userId} RETURNING "id", "sourceId"`;
    const row = rows[0];
    if (!row) throw new TuiPlusError(404, '频道不存在');
    await releaseOrDeleteTuiPlusSource(tx, { sourceId: row.sourceId, userId });
    return { success: true };
  });
}
