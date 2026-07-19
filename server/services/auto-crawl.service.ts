import crypto from 'node:crypto';

import prisma, { isDbConfigured } from '../db';
import { PostService } from '../post.service';
import { buildCrawlExtract, type AutoCrawlExtractionContext } from './crawl-content-ai.service';
import { filterCrawlContentBeforePublish, type CrawlQualityDecision } from './crawl-content-quality.service';
import {
      getAutoCrawlCategorySchema,
      getAutoCrawlDatabaseCategory,
      loadAutoCrawlDatabaseConfig,
      type AutoCrawlDatabaseCategory,
      type AutoCrawlDatabaseConfig,
    } from './auto-crawl-database-config.service';
import {
  cleanupAutoCrawlExecutionLogs,
  createAutoCrawlExecutionLogger,
  type AutoCrawlExecutionLogScope,
} from './auto-crawl-execution-log.service';
import { fetchAutoCrawlItems, resolveAutoCrawlFetchUrl } from './auto-crawl-fetch-parse.service';
import type {
  AutoCrawlConfig,
  AutoCrawlItem,
  AutoCrawlItemStatus,
  AutoCrawlRunRecord,
  AutoCrawlRunStatus,
  AutoCrawlSourceConfig,
} from './auto-crawl.types';
export type {
  AutoCrawlConfig,
  AutoCrawlCursorKind,
  AutoCrawlItemStatus,
  AutoCrawlRunRecord,
  AutoCrawlRunStatus,
  AutoCrawlSourceConfig,
  AutoCrawlSourceType,
} from './auto-crawl.types';
import {
  AUTO_CRAWL_MAX_POLL_INTERVAL_MINUTES,
  AUTO_CRAWL_MIN_POLL_INTERVAL_MINUTES,
  DEFAULT_CHECK_INTERVAL_MINUTES,
  DEFAULT_MAX_ITEMS_PER_SOURCE,
  DEFAULT_MAX_SOURCES_PER_RUN,
  DEFAULT_POLL_INTERVAL_MINUTES,
  cleanString,
  normalizeSource,
  nowIso,
  stableId,
  toInt,
} from './auto-crawl-normalize';

const CONFIG_RUN_LIMIT = 30;
const MAX_RUN_SOURCES = 50;
const MAX_ITEMS_PER_SOURCE = 50;

type RunTrigger = AutoCrawlRunRecord['trigger'];
type AutoCrawlExecutionLogger = ReturnType<typeof createAutoCrawlExecutionLogger>;
type DatabaseCategory = AutoCrawlDatabaseCategory;
type SourceStats = {
  fetched: number;
  parsed: number;
  scanned: number;
  delivered: number;
  filtered: number;
  duplicate: number;
  error: number;
  latestTitle: string;
  cursor: string;
  visibleMinCursor: string;
  visibleMaxCursor: string;
  warning: string;
};
type PublishedDuplicate = { postId: string | null; duplicateBy: 'sourcePostId' | 'fingerprint' | 'contentHash' } | null;
type StoredAutoCrawlReprocessItem = {
  source: AutoCrawlSourceConfig;
  item: AutoCrawlItem;
  fingerprint: string;
  contentHash: string;
  previousStatus: string;
  postId?: string | null;
};
type AutoCrawlPublishResult = {
  post: { id: string };
  extracted: Awaited<ReturnType<typeof buildCrawlExtract>>;
  category: DatabaseCategory;
};

let storageReady: Promise<void> | null = null;

function db() { return prisma as any; }
function hash(value: unknown) { return crypto.createHash('md5').update(String(value || '')).digest('hex'); }
function clampRun(value: unknown, fallback: number, max: number) { return toInt(value, fallback, 1, max); }
function clampInterval(value: unknown, fallback: number) {
  return toInt(value, fallback, AUTO_CRAWL_MIN_POLL_INTERVAL_MINUTES, AUTO_CRAWL_MAX_POLL_INTERVAL_MINUTES);
}
function errorText(error: unknown) { return error instanceof Error ? error.message : String(error || ''); }
function preview(raw: unknown, max = 180) {
      const text = String(raw || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max)}...` : text;
    }

function sourceFailureBackoffMinutes(failCount: unknown) {
  const failures = Math.max(1, Math.min(12, Number(failCount || 0) + 1));
  return Math.min(240, Math.max(5, 5 * (2 ** Math.min(5, failures - 1))));
}

    function qualityAudit(quality: CrawlQualityDecision) {
      return {
        reason: quality.reason,
        score: quality.score,
        flags: quality.flags,
        removed: quality.removed,
        diagnostics: quality.diagnostics,
      };
    }

    function extractionAudit(extracted: Awaited<ReturnType<typeof buildCrawlExtract>>) {
      return {
        schemaVersion: extracted.audit.schemaVersion,
        configuredMetaKeys: extracted.audit.configuredMetaKeys,
        normalizedMetaKeys: extracted.audit.metaStandardization.normalizedKeys,
        unexpectedMetaKeys: extracted.audit.metaStandardization.unexpectedKeys,
        rejectedMetaKeys: Object.keys(extracted.audit.metaStandardization.rejected),
        provider: extracted.audit.provider,
        model: extracted.audit.model,
        enrichmentStatus: extracted.audit.enrichmentStatus,
        enrichmentError: extracted.audit.enrichmentError,
      };
    }
async function exec(sql: string, ...values: unknown[]) { return db().$executeRawUnsafe(sql, ...values); }
async function rows<T = any>(sql: string, ...values: unknown[]): Promise<T[]> {
  return db().$queryRawUnsafe(sql, ...values) as Promise<T[]>;
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseStoredImages(metadata: unknown) {
  const images = parseJsonObject(metadata).images;
  return Array.isArray(images)
    ? images.map((image) => cleanString(image, 1000)).filter(Boolean)
    : [];
}

function schedulePostSideEffects(postId: string) {
  try {
    PostService.schedulePostRankingRefresh(postId);
  } catch (error) {
    console.warn('[auto-crawl] post ranking refresh failed:', errorText(error));
  }
}

function logEvent(
  logger: AutoCrawlExecutionLogger | null | undefined,
  event: {
    level?: 'info' | 'warn' | 'error';
    scope: AutoCrawlExecutionLogScope;
    phase: string;
    message: string;
    source?: AutoCrawlSourceConfig;
    item?: AutoCrawlItem;
    fingerprint?: string;
    status?: string;
    reason?: string;
    error?: string;
    counts?: Record<string, unknown>;
    details?: Record<string, unknown>;
  },
) {
  void logger?.log({
    level: event.level || 'info',
    scope: event.scope,
    phase: event.phase,
    message: event.message,
    sourceId: event.source?.id || null,
    sourceName: event.source?.sourceName || null,
    sourcePostId: event.item?.id || null,
    fingerprint: event.fingerprint || null,
    status: event.status || null,
    reason: event.reason || null,
    error: event.error || null,
    counts: event.counts,
    details: {
      ...(event.item ? {
        sourceUrl: event.item.link,
        titlePreview: preview(event.item.title, 120),
        contentPreview: preview(event.item.content),
        cursorValue: event.item.cursorValue,
        sourcePublishedAt: event.item.datetime,
        imageCount: event.item.images?.length || 0,
      } : {}),
      ...(event.details || {}),
    },
  });
}

export async function ensureAutoCrawlStorage() {
      if (!isDbConfigured()) return;
      if (!storageReady) {
        storageReady = rows<{ configTable: string | null; sourceTable: string | null; runTable: string | null; itemTable: string | null }>(
          `SELECT
            to_regclass('public."AutoCrawlConfig"')::text AS "configTable",
            to_regclass('public."AutoCrawlSource"')::text AS "sourceTable",
            to_regclass('public."AutoCrawlRun"')::text AS "runTable",
            to_regclass('public."AutoCrawlItem"')::text AS "itemTable"`,
        ).then(([tables]) => {
          if (!tables?.configTable || !tables.sourceTable || !tables.runTable || !tables.itemTable) {
            throw new Error('auto_crawl_database_migration_required');
          }
        }).catch((error) => {
          storageReady = null;
          throw error;
        });
      }
      await storageReady;
    }

    function mapSource(row: any): AutoCrawlSourceConfig {
  return normalizeSource({
    ...row,
    categoryId: cleanString(row.categoryId, 128),
    categoryName: cleanString(row.resolvedCategoryName, 120),
    nextRunAt: nowIso(row.nextRunAt),
    lastSyncAt: nowIso(row.lastSyncAt),
    createdAt: nowIso(row.createdAt) || undefined,
    updatedAt: nowIso(row.updatedAt) || undefined,
  });
}

function mapRun(row: any): AutoCrawlRunRecord {
  return {
    id: String(row.id),
    status: String(row.status || 'SUCCEEDED') as AutoCrawlRunStatus,
    trigger: String(row.trigger || 'SCHEDULED') as RunTrigger,
    startedAt: nowIso(row.startedAt) || new Date().toISOString(),
    finishedAt: nowIso(row.finishedAt) || nowIso(row.startedAt) || new Date().toISOString(),
    scanned: Number(row.scanned || 0),
    delivered: Number(row.delivered || 0),
    filtered: Number(row.filtered || 0),
    duplicate: Number(row.duplicate || 0),
    error: Number(row.error || 0),
    sourceCount: Number(row.sourceCount || 0),
    skipReason: row.skipReason || null,
    errorMessage: row.errorMessage || null,
    latestTitle: row.latestTitle || null,
  };
}

async function listAutoCrawlCategoryOptions() {
  const categories = await db().category.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  });
  return categories.map((category: any) => ({
    id: String(category.id || ''),
    name: cleanString(category.name, 120) || String(category.id || ''),
    slug: cleanString(category.slug, 120),
  }));
}

export async function getAutoCrawlConfig(): Promise<AutoCrawlConfig> {
  if (!isDbConfigured()) {
    return {
      enabled: false,
      checkIntervalMinutes: DEFAULT_CHECK_INTERVAL_MINUTES,
      maxItemsPerSource: DEFAULT_MAX_ITEMS_PER_SOURCE,
      maxSourcesPerRun: DEFAULT_MAX_SOURCES_PER_RUN,
      categoryOptions: [],
      sources: [],
      recentRuns: [],
    };
  }

  await ensureAutoCrawlStorage();
  const [configs, sources, runs, categoryOptions] = await Promise.all([
    rows<any>(`SELECT "enabled","checkIntervalMinutes","maxItemsPerSource","maxSourcesPerRun" FROM "AutoCrawlConfig" WHERE "id"='default' LIMIT 1`),
    rows<any>(`SELECT s."id",s."source",s."type",s."sourceName",s."categoryId",s."authorUserId",s."showContact",s."disabled",s."cursor",s."cursorKind",s."pollIntervalMinutes",s."nextRunAt",s."lastSyncAt",s."lastFetchedCount",s."lastParsedCount",s."lastCandidateCount",s."lastDeliveredCount",s."lastFilteredCount",s."lastDuplicateCount",s."failCount",s."lastError",s."lastVisibleMinCursor",s."lastVisibleMaxCursor",s."sourceHealth",s."createdAt",s."updatedAt",c."name" AS "resolvedCategoryName"
      FROM "AutoCrawlSource" s
      LEFT JOIN "Category" c ON c."id"=s."categoryId"
      ORDER BY s."disabled" ASC,c."name" ASC NULLS LAST,s."updatedAt" DESC`),
    rows<any>(`SELECT * FROM "AutoCrawlRun" ORDER BY "startedAt" DESC,"id" DESC LIMIT $1::integer`, CONFIG_RUN_LIMIT),
    listAutoCrawlCategoryOptions(),
  ]);
  const config = configs[0] || {};
  return {
    enabled: Boolean(config.enabled),
    checkIntervalMinutes: clampInterval(config.checkIntervalMinutes, DEFAULT_CHECK_INTERVAL_MINUTES),
    maxItemsPerSource: clampRun(config.maxItemsPerSource, DEFAULT_MAX_ITEMS_PER_SOURCE, MAX_ITEMS_PER_SOURCE),
    maxSourcesPerRun: clampRun(config.maxSourcesPerRun, DEFAULT_MAX_SOURCES_PER_RUN, MAX_RUN_SOURCES),
    categoryOptions,
    sources: sources.map(mapSource),
    recentRuns: runs.map(mapRun),
  };
}

async function markEnabledAutoCrawlSourcesDueNow() {
  await exec(
    `UPDATE "AutoCrawlSource"
     SET "nextRunAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
     WHERE "disabled"=FALSE`,
  );
}

export async function updateAutoCrawlConfig(patch: Partial<AutoCrawlConfig>) {
  await ensureAutoCrawlStorage();
  const enabled = patch.enabled ?? null;
  const checkIntervalMinutes = patch.checkIntervalMinutes === undefined ? null : clampInterval(patch.checkIntervalMinutes, DEFAULT_CHECK_INTERVAL_MINUTES);
  const maxItemsPerSource = patch.maxItemsPerSource === undefined ? null : clampRun(patch.maxItemsPerSource, DEFAULT_MAX_ITEMS_PER_SOURCE, MAX_ITEMS_PER_SOURCE);
  const maxSourcesPerRun = patch.maxSourcesPerRun === undefined ? null : clampRun(patch.maxSourcesPerRun, DEFAULT_MAX_SOURCES_PER_RUN, MAX_RUN_SOURCES);
  await exec(
    `INSERT INTO "AutoCrawlConfig"("id","enabled","checkIntervalMinutes","maxItemsPerSource","maxSourcesPerRun","updatedAt")
     VALUES(
       'default',
       COALESCE($1::boolean,false),
       COALESCE($2::integer,$5::integer),
       COALESCE($3::integer,$6::integer),
       COALESCE($4::integer,$7::integer),
       CURRENT_TIMESTAMP
     )
     ON CONFLICT("id") DO UPDATE SET
       "enabled"=COALESCE($1::boolean,"AutoCrawlConfig"."enabled"),
       "checkIntervalMinutes"=COALESCE($2::integer,"AutoCrawlConfig"."checkIntervalMinutes"),
       "maxItemsPerSource"=COALESCE($3::integer,"AutoCrawlConfig"."maxItemsPerSource"),
       "maxSourcesPerRun"=COALESCE($4::integer,"AutoCrawlConfig"."maxSourcesPerRun"),
       "updatedAt"=CURRENT_TIMESTAMP`,
    enabled,
    checkIntervalMinutes,
    maxItemsPerSource,
    maxSourcesPerRun,
    DEFAULT_CHECK_INTERVAL_MINUTES,
    DEFAULT_MAX_ITEMS_PER_SOURCE,
    DEFAULT_MAX_SOURCES_PER_RUN,
  );
  if (enabled === true) await markEnabledAutoCrawlSourcesDueNow();
  return getAutoCrawlConfig();
}

async function validateSource(raw: Partial<AutoCrawlSourceConfig>) {
  const source = normalizeSource(raw);
  if (!source.source) throw new Error('auto_crawl_source_required');
  const databaseConfig = await loadAutoCrawlDatabaseConfig();
  const category = getAutoCrawlDatabaseCategory(databaseConfig, source.categoryId);
  if (!source.disabled && !source.authorUserId) throw new Error('auto_crawl_author_required');
  return { source, category };
}

export async function upsertAutoCrawlSource(raw: Partial<AutoCrawlSourceConfig>) {
  await ensureAutoCrawlStorage();
  const { source, category } = await validateSource(raw);
  await exec(
    `INSERT INTO "AutoCrawlSource"("id","source","type","sourceName","categoryId","authorUserId","showContact","disabled","cursor","cursorKind","pollIntervalMinutes","updatedAt")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP)
     ON CONFLICT("source") DO UPDATE SET
       "type"=EXCLUDED."type","sourceName"=EXCLUDED."sourceName","categoryId"=EXCLUDED."categoryId",
       "authorUserId"=EXCLUDED."authorUserId","showContact"=EXCLUDED."showContact","disabled"=EXCLUDED."disabled",
       "cursor"=EXCLUDED."cursor","cursorKind"=EXCLUDED."cursorKind","pollIntervalMinutes"=EXCLUDED."pollIntervalMinutes",
       "updatedAt"=CURRENT_TIMESTAMP`,
    source.id,
    source.source,
    source.type,
    source.sourceName,
    category.id,
    source.authorUserId,
    source.showContact,
    source.disabled,
    source.cursor,
    source.cursorKind,
    source.pollIntervalMinutes,
  );
  return getAutoCrawlConfig();
}

export async function updateAutoCrawlSource(raw: Partial<AutoCrawlSourceConfig>) {
  await ensureAutoCrawlStorage();
  const { source, category } = await validateSource(raw);
  if (!source.id) throw new Error('auto_crawl_source_id_required');
  const changed = await exec(
    `UPDATE "AutoCrawlSource" SET
      "source"=$2,"type"=$3,"sourceName"=$4,"categoryId"=$5,"authorUserId"=$6,"showContact"=$7,
      "disabled"=$8,"cursor"=$9,"cursorKind"=$10,"pollIntervalMinutes"=$11,"updatedAt"=CURRENT_TIMESTAMP
     WHERE "id"=$1`,
    source.id,
    source.source,
    source.type,
    source.sourceName,
    category.id,
    source.authorUserId,
    source.showContact,
    source.disabled,
    source.cursor,
    source.cursorKind,
    source.pollIntervalMinutes,
  );
  if (Number(changed || 0) === 0) throw new Error('auto_crawl_source_not_found');
  return getAutoCrawlConfig();
}

export async function deleteAutoCrawlSource(id: string) {
  await ensureAutoCrawlStorage();
  await exec(`DELETE FROM "AutoCrawlSource" WHERE "id"=$1`, cleanString(id, 80));
  return getAutoCrawlConfig();
}

function contentHash(item: AutoCrawlItem) {
  return hash(`${item.title}\n${item.content}\n${(item.images || []).join('|')}`);
}
function publishContentHash(item: AutoCrawlItem, quality: CrawlQualityDecision) {
  return hash(`${quality.cleanedTitle || item.title}\n${quality.cleanedContent}\n${(item.images || []).join('|')}`);
}
function fingerprint(source: AutoCrawlSourceConfig, item: AutoCrawlItem) {
  return hash([source.id, item.id, item.link].join('|'));
}

async function findPublishedDuplicate(
  source: AutoCrawlSourceConfig,
  item: AutoCrawlItem,
  fp: string,
  itemHash: string,
): Promise<PublishedDuplicate> {
  const found = await rows<{ postId: string | null; duplicateBy: 'sourcePostId' | 'fingerprint' | 'contentHash' }>(
    `SELECT "postId",CASE
       WHEN "sourceId"=$1 AND "sourcePostId"=$2 THEN 'sourcePostId'
       WHEN "fingerprint"=$3 THEN 'fingerprint'
       ELSE 'contentHash' END AS "duplicateBy"
     FROM "AutoCrawlItem"
     WHERE "postId" IS NOT NULL
       AND (("sourceId"=$1 AND "sourcePostId"=$2) OR "fingerprint"=$3 OR "contentHash"=$4)
     ORDER BY CASE
       WHEN "sourceId"=$1 AND "sourcePostId"=$2 THEN 0
       WHEN "fingerprint"=$3 THEN 1
       ELSE 2 END,
       "updatedAt" DESC
     LIMIT 1`,
    source.id,
    item.id,
    fp,
    itemHash,
  );
  return found[0] || null;
}

async function writeItem(source: AutoCrawlSourceConfig, runId: string, item: AutoCrawlItem, fp: string, itemHash: string) {
  await exec(
    `INSERT INTO "AutoCrawlItem"("id","sourceId","runId","sourceType","sourceName","sourcePostId","sourceUrl","rawTitle","rawContent","contentHash","fingerprint","cursorValue","cursorNumber","sourcePublishedAt","status","metadata","lastSeenAt","updatedAt")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'RAW',$15::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
     ON CONFLICT("sourceId","sourcePostId") DO UPDATE SET
       "runId"=EXCLUDED."runId","sourceType"=EXCLUDED."sourceType","sourceName"=EXCLUDED."sourceName",
       "sourceUrl"=EXCLUDED."sourceUrl","rawTitle"=EXCLUDED."rawTitle","rawContent"=EXCLUDED."rawContent",
       "contentHash"=EXCLUDED."contentHash","fingerprint"=EXCLUDED."fingerprint",
       "cursorValue"=EXCLUDED."cursorValue","cursorNumber"=EXCLUDED."cursorNumber",
       "sourcePublishedAt"=EXCLUDED."sourcePublishedAt",
       "metadata"=COALESCE("AutoCrawlItem"."metadata",'{}'::jsonb)||EXCLUDED."metadata",
       "lastSeenAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP`,
    stableId(fp),
    source.id,
    runId,
    source.type,
    source.sourceName,
    item.id,
    item.link || null,
    item.title,
    item.content,
    itemHash,
    fp,
    item.cursorValue,
    item.cursorNumber,
    new Date(item.timestamp),
    JSON.stringify({ source: source.source, imageCount: item.images?.length || 0, images: item.images || [] }),
  );
}

async function markItem(
  fp: string,
  status: AutoCrawlItemStatus,
  data: {
    title?: string;
    content?: string;
    postId?: string;
    reason?: string;
    error?: string;
    contentHash?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await exec(
    `UPDATE "AutoCrawlItem" SET
      "status"=$2,"cleanTitle"=COALESCE($3,"cleanTitle"),"cleanContent"=COALESCE($4,"cleanContent"),
      "postId"=COALESCE($5,"postId"),"filterReason"=$6,"errorMessage"=$7,
      "contentHash"=COALESCE($8,"contentHash"),
      "metadata"=COALESCE("metadata",'{}'::jsonb)||$9::jsonb,"updatedAt"=CURRENT_TIMESTAMP
     WHERE "fingerprint"=$1`,
    fp,
    status,
    data.title || null,
    data.content || null,
    data.postId || null,
    data.reason || null,
    data.error || null,
    data.contentHash || null,
    JSON.stringify(data.metadata || {}),
  );
}

function extractionContext(
      category: DatabaseCategory,
      databaseConfig: AutoCrawlDatabaseConfig,
    ): AutoCrawlExtractionContext {
      return {
        category,
        schema: getAutoCrawlCategorySchema(databaseConfig, category),
        locationPresets: databaseConfig.locationPresets,
      };
    }

    async function publish(
      source: AutoCrawlSourceConfig,
      item: AutoCrawlItem,
      quality: CrawlQualityDecision,
      context: AutoCrawlExtractionContext,
      logger?: AutoCrawlExecutionLogger | null,
      fp?: string,
    ): Promise<AutoCrawlPublishResult> {
      if (!source.authorUserId) throw new Error('auto_crawl_author_required');
      const category = context.category;
      const extracted = await buildCrawlExtract({
        context,
        rawTitle: quality.cleanedTitle || item.title,
        rawContent: item.content,
        cleanedContent: quality.cleanedContent,
        sourceName: source.sourceName,
      });

      logEvent(logger, {
        level: extracted.audit.enrichmentStatus === 'success' ? 'info' : 'warn',
        scope: 'ai',
        phase: 'ai_processed',
        message: extracted.audit.enrichmentStatus === 'success'
          ? 'AI 按数据库分类和 Meta Schema 完成可选结构化提取'
          : 'AI 可选结构化提取未完成，正文继续发布',
        source,
        item,
        fingerprint: fp,
        status: extracted.audit.enrichmentStatus,
        reason: extracted.audit.enrichmentError || undefined,
        details: extractionAudit(extracted),
      });

      const post = await prisma.$transaction(async (tx) => {
        await (tx as any).$queryRawUnsafe(`SELECT set_config('app.auto_crawl_write','1',true)`);
        const created = await tx.post.create({
          data: {
            title: extracted.title,
            content: extracted.content,
            location: extracted.location || null,
            contact: extracted.contact,
            showContact: source.showContact && Boolean(extracted.contact),
            images: item.images || [],
            source: (source.sourceName || source.source).slice(0, 80),
            isAnonymous: false,
            isPublished: true,
            bumpedAt: new Date(),
            category: { connect: { id: category.id } },
            user: { connect: { id: source.authorUserId } },
            categoryMeta: extracted.meta,
            categoryMetaSchemaVersion: extracted.audit.schemaVersion || null,
          },
          select: { id: true },
        });
        return created;
      });

      return { post, extracted, category };
    }

    function commitCursor(stats: SourceStats, item: AutoCrawlItem) {
  if (item.cursorNumber > Number(stats.cursor || 0)) stats.cursor = String(item.cursorNumber);
}

async function updateSourceStats(source: AutoCrawlSourceConfig, stats: SourceStats) {
      const cursorKind = stats.cursor ? (source.type === 'rss' ? 'timestamp' : 'message_id') : 'baseline_pending';
      const health = stats.error || stats.warning ? 'PARTIAL' : 'OK';
      const lastError = stats.warning || (stats.error ? `${stats.error} 条内容处理失败，可在失败列表重新处理` : null);
      await exec(
        `UPDATE "AutoCrawlSource" SET
          "cursor"=$2,"cursorKind"=$3,"lastSyncAt"=CURRENT_TIMESTAMP,
          "nextRunAt"=CURRENT_TIMESTAMP+($4::text||' minutes')::interval,
          "lastFetchedCount"=$5,"lastParsedCount"=$6,"lastCandidateCount"=$7,"lastDeliveredCount"=$8,
          "lastFilteredCount"=$9,"lastDuplicateCount"=$10,"lastVisibleMinCursor"=$11,"lastVisibleMaxCursor"=$12,
          "failCount"=0,"lastError"=$13,"sourceHealth"=$14,"updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1`,
        source.id,
        stats.cursor || source.cursor || '',
        cursorKind,
        clampInterval(source.pollIntervalMinutes, DEFAULT_POLL_INTERVAL_MINUTES),
        stats.fetched,
        stats.parsed,
        stats.scanned,
        stats.delivered,
        stats.filtered,
        stats.duplicate,
        stats.visibleMinCursor || null,
        stats.visibleMaxCursor || null,
        lastError,
        health,
      );
    }

    async function skipSource(source: AutoCrawlSourceConfig, reason: string) {
      await exec(
        `UPDATE "AutoCrawlSource" SET "disabled"=TRUE,"nextRunAt"=NULL,"lastError"=$2,
          "sourceHealth"='CONFIG_ERROR',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
        source.id,
        reason,
      );
    }

async function processSource(
      runId: string,
      inputSource: AutoCrawlSourceConfig,
      config: AutoCrawlConfig,
      databaseConfig: AutoCrawlDatabaseConfig,
      logger?: AutoCrawlExecutionLogger | null,
    ) {
      const stats: SourceStats = {
        fetched: 0,
        parsed: 0,
        scanned: 0,
        delivered: 0,
        filtered: 0,
        duplicate: 0,
        error: 0,
        latestTitle: '',
        cursor: inputSource.cursor || '',
        visibleMinCursor: '',
        visibleMaxCursor: '',
        warning: '',
      };
      const source = inputSource;

      logEvent(logger, {
        scope: 'source',
        phase: 'source_started',
        message: '开始处理数据源',
        source,
        details: { fetchUrl: resolveAutoCrawlFetchUrl(source), categoryId: source.categoryId, cursor: source.cursor },
      });

      if (!source.authorUserId) {
        await skipSource(source, '未绑定发布账号');
        return stats;
      }

      let category: DatabaseCategory;
      try {
        category = getAutoCrawlDatabaseCategory(databaseConfig, source.categoryId);
      } catch {
        await skipSource(source, '未绑定有效数据库分类');
        return stats;
      }
      const context = extractionContext(category, databaseConfig);
      const fetched = await fetchAutoCrawlItems(source, { maxItemsPerSource: config.maxItemsPerSource });
      stats.fetched = fetched.all.length;
      stats.parsed = fetched.items.length;
      stats.visibleMinCursor = fetched.visibleMinCursor;
      stats.visibleMaxCursor = fetched.visibleMaxCursor;
      if (fetched.parseMeta.gapUnresolved) {
        stats.warning = `telegram_gap_partially_recovered:${fetched.parseMeta.gapFrom}:${fetched.parseMeta.gapTo}:${fetched.parseMeta.gapStoppedReason}`;
        logEvent(logger, {
          level: 'warn', scope: 'source', phase: 'telegram_gap_partially_recovered',
          message: 'Telegram 历史缺口无法完全回补，已发布全部可恢复内容并保留缺口审计',
          source, status: 'PARTIAL', reason: stats.warning, details: fetched.parseMeta,
        });
      }

      for (const item of fetched.items.slice(0, clampRun(config.maxItemsPerSource, DEFAULT_MAX_ITEMS_PER_SOURCE, MAX_ITEMS_PER_SOURCE))) {
        stats.scanned += 1;
        const itemHash = contentHash(item);
        const fp = fingerprint(source, item);
        const duplicate = await findPublishedDuplicate(source, item, fp, itemHash);
        if (duplicate) {
          stats.duplicate += 1;
          logEvent(logger, {
            scope: 'item', phase: 'duplicate_detected', message: '内容已发布，跳过重复项',
            source, item, fingerprint: fp, status: 'DUPLICATE', reason: duplicate.duplicateBy,
            details: { existingPostId: duplicate.postId },
          });
          commitCursor(stats, item);
          continue;
        }

        await writeItem(source, runId, item, fp, itemHash);
        const quality = filterCrawlContentBeforePublish({ title: item.title, content: item.content, images: item.images });
        logEvent(logger, {
          scope: 'quality', phase: 'quality_checked',
          message: quality.shouldPublish ? '质量过滤通过' : '质量过滤未通过',
          source, item, fingerprint: fp, status: quality.shouldPublish ? 'PASSED' : 'REJECTED',
          reason: quality.reason, details: qualityAudit(quality),
        });

        const publishHash = publishContentHash(item, quality);
        if (!quality.shouldPublish) {
          stats.filtered += 1;
          await markItem(fp, 'REJECTED', {
            title: quality.cleanedTitle || item.title,
            content: quality.cleanedContent,
            reason: quality.reason,
            contentHash: publishHash,
            metadata: { quality: qualityAudit(quality), publishContentHash: publishHash, parse: fetched.parseMeta, imageCount: item.images?.length || 0 },
          });
          commitCursor(stats, item);
          continue;
        }

        const cleanedDuplicate = publishHash === itemHash
          ? null
          : await findPublishedDuplicate(source, item, fp, publishHash);
        if (cleanedDuplicate) {
          stats.duplicate += 1;
          await markItem(fp, 'DUPLICATE', {
            title: quality.cleanedTitle || item.title,
            content: quality.cleanedContent,
            reason: cleanedDuplicate.duplicateBy,
            contentHash: publishHash,
            metadata: {
              quality: qualityAudit(quality),
              publishContentHash: publishHash,
              duplicate: { postId: cleanedDuplicate.postId, by: cleanedDuplicate.duplicateBy },
              parse: fetched.parseMeta,
              imageCount: item.images?.length || 0,
            },
          });
          logEvent(logger, {
            scope: 'item', phase: 'duplicate_after_clean', message: '清洗后内容已发布，跳过重复项',
            source, item, fingerprint: fp, status: 'DUPLICATE', reason: cleanedDuplicate.duplicateBy,
            details: { existingPostId: cleanedDuplicate.postId, publishContentHash: publishHash },
          });
          commitCursor(stats, item);
          continue;
        }

        try {
          const { post, extracted } = await publish(source, item, quality, context, logger, fp);
          await markItem(fp, 'PUBLISHED', {
            title: extracted.title,
            content: extracted.content,
            postId: post.id,
            contentHash: publishHash,
            metadata: {
              quality: qualityAudit(quality),
              extraction: extractionAudit(extracted),
              publishContentHash: publishHash,
              imageCount: item.images?.length || 0,
              parse: fetched.parseMeta,
            },
          });
          logEvent(logger, {
            scope: 'publish', phase: 'publish_succeeded', message: '帖子发布成功',
            source, item, fingerprint: fp, status: 'PUBLISHED',
            details: { postId: post.id, categoryId: category.id, categoryName: category.name },
          });
          schedulePostSideEffects(post.id);
          stats.delivered += 1;
          stats.latestTitle ||= extracted.title;
        } catch (error) {
          const message = errorText(error);
          stats.error += 1;
          await markItem(fp, 'FAILED', {
            error: message,
            contentHash: publishHash,
            metadata: { quality: qualityAudit(quality), publishContentHash: publishHash, imageCount: item.images?.length || 0, parse: fetched.parseMeta },
          });
          logEvent(logger, {
            level: 'error', scope: 'publish', phase: 'publish_failed',
            message: '帖子发布失败，已进入失败队列', source, item, fingerprint: fp,
            status: 'FAILED', error: message,
          });
        }
        commitCursor(stats, item);
      }

      await updateSourceStats(source, stats);
      return stats;
    }

    function newRunId(trigger: RunTrigger) {
  return stableId(`${trigger}:${Date.now()}:${crypto.randomUUID()}`);
}
async function createRun(trigger: RunTrigger, owner: string) {
  const id = newRunId(trigger);
  await exec(
    `INSERT INTO "AutoCrawlRun"("id","status","trigger","lockOwner","startedAt") VALUES($1,'RUNNING',$2,$3,CURRENT_TIMESTAMP)`,
    id,
    trigger,
    owner,
  );
  return id;
}
async function finishRun(id: string, patch: Partial<AutoCrawlRunRecord>) {
  await exec(
    `UPDATE "AutoCrawlRun" SET
      "status"=$2,"finishedAt"=CURRENT_TIMESTAMP,"scanned"=$3,"delivered"=$4,"filtered"=$5,
      "duplicate"=$6,"error"=$7,"sourceCount"=$8,"skipReason"=$9,"errorMessage"=$10,"latestTitle"=$11
     WHERE "id"=$1`,
    id,
    patch.status || 'SKIPPED',
    patch.scanned || 0,
    patch.delivered || 0,
    patch.filtered || 0,
    patch.duplicate || 0,
    patch.error || 0,
    patch.sourceCount || 0,
    patch.skipReason || null,
    patch.errorMessage || null,
    patch.latestTitle || null,
  );
  return mapRun((await rows<any>(`SELECT * FROM "AutoCrawlRun" WHERE "id"=$1 LIMIT 1`, id))[0]);
}

async function runnableSources(config: AutoCrawlConfig, force: boolean) {
  const limit = clampRun(config.maxSourcesPerRun, DEFAULT_MAX_SOURCES_PER_RUN, MAX_RUN_SOURCES);
  const due = force ? '' : `AND (s."nextRunAt" IS NULL OR s."nextRunAt"<=CURRENT_TIMESTAMP)`;
  const result = await rows<any>(`SELECT s."id",s."source",s."type",s."sourceName",s."categoryId",s."authorUserId",s."showContact",s."disabled",s."cursor",s."cursorKind",s."pollIntervalMinutes",s."nextRunAt",s."lastSyncAt",s."lastFetchedCount",s."lastParsedCount",s."lastCandidateCount",s."lastDeliveredCount",s."lastFilteredCount",s."lastDuplicateCount",s."failCount",s."lastError",s."lastVisibleMinCursor",s."lastVisibleMaxCursor",s."sourceHealth",s."createdAt",s."updatedAt",c."name" AS "resolvedCategoryName"
    FROM "AutoCrawlSource" s
    JOIN "Category" c ON c."id"=s."categoryId"
    WHERE s."disabled"=FALSE ${due}
    ORDER BY s."nextRunAt" ASC NULLS FIRST,s."updatedAt" ASC
    LIMIT $1::integer`, limit);
  return result.map(mapSource);
}

async function finishLoggedRun(
  logger: AutoCrawlExecutionLogger,
  id: string,
  patch: Partial<AutoCrawlRunRecord>,
) {
  const run = await finishRun(id, patch);
  logEvent(logger, {
    scope: 'run',
    phase: 'run_finished',
    message: '自动抓取运行结束',
    status: run.status,
    reason: run.skipReason || run.errorMessage || undefined,
    counts: {
      sourceCount: run.sourceCount,
      scanned: run.scanned,
      delivered: run.delivered,
      filtered: run.filtered,
      duplicate: run.duplicate,
      error: run.error,
    },
  });
  return run;
}

export async function runAutoCrawlOnce(options: { trigger?: RunTrigger; force?: boolean } = {}) {
  if (!isDbConfigured()) throw new Error('Database is not configured');
  await ensureAutoCrawlStorage();
  await cleanupAutoCrawlExecutionLogs();

  const trigger = options.trigger || 'MANUAL';
  const owner = `${trigger}:${Date.now()}:${crypto.randomUUID()}`;
  const id = await createRun(trigger, owner);
  const logger = createAutoCrawlExecutionLogger(id, trigger);

  try {
    const config = await getAutoCrawlConfig();
    if (!config.enabled && !options.force) {
      return await finishLoggedRun(logger, id, { status: 'SKIPPED', skipReason: '自动抓取未启用' });
    }
    const databaseConfig = await loadAutoCrawlDatabaseConfig();
      const sources = await runnableSources(config, Boolean(options.force));
      if (!sources.length) {
      return await finishLoggedRun(logger, id, { status: 'SKIPPED', skipReason: '暂无到期数据源' });
    }

    const totals = {
      scanned: 0,
      delivered: 0,
      filtered: 0,
      duplicate: 0,
      error: 0,
      latestTitle: '',
      sourceCount: sources.length,
    };
    const sourceConcurrency = 4;
    for (let index = 0; index < sources.length; index += sourceConcurrency) {
      const batch = sources.slice(index, index + sourceConcurrency);
      const results = await Promise.all(batch.map(async (source) => {
        try {
          return await processSource(id, source, config, databaseConfig, logger);
        } catch (error) {
          await exec(
            `UPDATE "AutoCrawlSource" SET
              "failCount"="failCount"+1,
              "nextRunAt"=CURRENT_TIMESTAMP+($3::text||' minutes')::interval,
              "lastError"=$2,
              "sourceHealth"='ERROR',
              "updatedAt"=CURRENT_TIMESTAMP
             WHERE "id"=$1`,
            source.id,
            errorText(error).slice(0, 1000),
            sourceFailureBackoffMinutes(source.failCount),
          );
          logEvent(logger, {
            level: 'error',
            scope: 'source',
            phase: 'source_failed',
            message: '数据源处理失败，已进入退避',
            source,
            status: 'FAILED',
            error: errorText(error),
          });
          return null;
        }
      }));

      for (const stats of results) {
        if (!stats) {
          totals.error += 1;
          continue;
        }
        totals.scanned += stats.scanned;
        totals.delivered += stats.delivered;
        totals.filtered += stats.filtered;
        totals.duplicate += stats.duplicate;
        totals.error += stats.error;
        totals.latestTitle ||= stats.latestTitle;
      }
    }

    return await finishLoggedRun(logger, id, {
      status: totals.error ? 'PARTIAL_FAILED' : 'SUCCEEDED',
      ...totals,
    });
  } catch (error) {
    logEvent(logger, {
      level: 'error',
      scope: 'run',
      phase: 'run_failed',
      message: '自动抓取运行失败',
      status: 'FAILED',
      error: errorText(error),
    });
    return await finishLoggedRun(logger, id, {
      status: 'FAILED',
      error: 1,
      errorMessage: errorText(error),
    });
  } finally {
    await logger.flush().catch(() => undefined);
  }
}

async function fetchStoredItemsForReprocess(options: {
  status?: string;
  sourceId?: string;
  ids?: string[];
  limit: number;
}): Promise<StoredAutoCrawlReprocessItem[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const ids = Array.isArray(options.ids)
    ? Array.from(new Set(options.ids.map((id) => cleanString(id, 80)).filter(Boolean)))
    : [];
  if (ids.length > 0) {
    params.push(ids);
    conditions.push(`i."id"=ANY($${params.length}::text[])`);
  }
  if (options.status) {
    params.push(options.status);
    conditions.push(`i."status"=$${params.length}`);
  }
  if (options.sourceId) {
    params.push(options.sourceId);
    conditions.push(`i."sourceId"=$${params.length}`);
  }
  params.push(options.limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const stored = await rows<any>(`SELECT i.*,s."source",s."type",s."sourceName" AS "sourceConfigName",s."categoryId",s."authorUserId",s."showContact",s."disabled",s."cursor",s."cursorKind",s."pollIntervalMinutes",s."nextRunAt",s."lastSyncAt",s."lastFetchedCount",s."lastParsedCount",s."lastCandidateCount",s."lastDeliveredCount",s."lastFilteredCount",s."lastDuplicateCount",s."failCount",s."lastError",s."lastVisibleMinCursor",s."lastVisibleMaxCursor",s."sourceHealth",s."createdAt",s."updatedAt",c."name" AS "resolvedCategoryName"
    FROM "AutoCrawlItem" i
    JOIN "AutoCrawlSource" s ON s."id"=i."sourceId"
    LEFT JOIN "Category" c ON c."id"=s."categoryId"
    ${where}
    ORDER BY i."updatedAt" DESC,i."id" DESC
    LIMIT $${params.length}::integer`, ...params);

  return stored.map((row) => {
    const source = mapSource({ ...row, sourceName: row.sourceConfigName || row.sourceName });
    const publishedAt = row.sourcePublishedAt ? new Date(row.sourcePublishedAt) : new Date(row.updatedAt || Date.now());
    const timestamp = Number.isFinite(publishedAt.getTime()) ? publishedAt.getTime() : Date.now();
    return {
      source,
      item: {
        id: cleanString(row.sourcePostId || row.id, 160),
        title: cleanString(row.rawTitle || row.cleanTitle, 500),
        content: String(row.rawContent || row.cleanContent || ''),
        rawText: String(row.rawContent || row.cleanContent || ''),
        link: cleanString(row.sourceUrl, 1000),
        timestamp,
        datetime: new Date(timestamp).toISOString(),
        cursorValue: cleanString(row.cursorValue, 128),
        cursorNumber: Number(row.cursorNumber || 0),
        images: parseStoredImages(row.metadata),
      },
      fingerprint: cleanString(row.fingerprint, 80),
      contentHash: cleanString(row.contentHash, 80),
      previousStatus: cleanString(row.status, 40),
      postId: row.postId || null,
    };
  });
}

export async function reprocessAutoCrawlItems(options: {
      status?: string;
      sourceId?: string;
      ids?: string[];
      limit?: number;
    } = {}) {
      await ensureAutoCrawlStorage();
      const [storedItems, databaseConfig] = await Promise.all([
        fetchStoredItemsForReprocess({
          status: options.status,
          sourceId: options.sourceId,
          ids: options.ids,
          limit: clampRun(options.limit, 50, 100),
        }),
        loadAutoCrawlDatabaseConfig(),
      ]);
      if (!storedItems.length) {
        return { run: null, items: [], summary: { scanned: 0, delivered: 0, filtered: 0, duplicate: 0, error: 0 } };
      }

      const owner = `REPROCESS:${Date.now()}:${crypto.randomUUID()}`;
      const id = await createRun('REPROCESS', owner);
      const logger = createAutoCrawlExecutionLogger(id, 'REPROCESS');
      const totals = { scanned: 0, delivered: 0, filtered: 0, duplicate: 0, error: 0, latestTitle: '', sourceCount: new Set(storedItems.map((stored) => stored.source.id)).size };
      const items: Array<{ id: string; status: AutoCrawlItemStatus; postId?: string | null; error?: string | null }> = [];

      try {
        for (const stored of storedItems) {
          const { source, item, fingerprint: fp, contentHash: itemHash } = stored;
          totals.scanned += 1;
          const duplicate = await findPublishedDuplicate(source, item, fp, itemHash);
          if (duplicate && duplicate.postId !== stored.postId) {
            totals.duplicate += 1;
            await markItem(fp, 'DUPLICATE', { reason: duplicate.duplicateBy, metadata: { existingPostId: duplicate.postId, reprocessedAt: new Date().toISOString() } });
            items.push({ id: item.id, status: 'DUPLICATE', postId: duplicate.postId });
            continue;
          }

          const quality = filterCrawlContentBeforePublish({ title: item.title, content: item.content, images: item.images });
          const publishHash = publishContentHash(item, quality);
          if (!quality.shouldPublish) {
            totals.filtered += 1;
            await markItem(fp, 'REJECTED', {
              title: quality.cleanedTitle || item.title,
              content: quality.cleanedContent,
              reason: quality.reason,
              contentHash: publishHash,
              metadata: { quality: qualityAudit(quality), publishContentHash: publishHash, reprocessedAt: new Date().toISOString() },
            });
            items.push({ id: item.id, status: 'REJECTED' });
            continue;
          }

          const cleanedDuplicate = publishHash === itemHash
            ? null
            : await findPublishedDuplicate(source, item, fp, publishHash);
          if (cleanedDuplicate && cleanedDuplicate.postId !== stored.postId) {
            totals.duplicate += 1;
            await markItem(fp, 'DUPLICATE', {
              title: quality.cleanedTitle || item.title,
              content: quality.cleanedContent,
              reason: cleanedDuplicate.duplicateBy,
              contentHash: publishHash,
              metadata: {
                quality: qualityAudit(quality),
                publishContentHash: publishHash,
                duplicate: { postId: cleanedDuplicate.postId, by: cleanedDuplicate.duplicateBy },
                reprocessedAt: new Date().toISOString(),
              },
            });
            items.push({ id: item.id, status: 'DUPLICATE', postId: cleanedDuplicate.postId });
            continue;
          }

          try {
            const category = getAutoCrawlDatabaseCategory(databaseConfig, source.categoryId);
            const context = extractionContext(category, databaseConfig);
            const { post, extracted } = await publish(source, item, quality, context, logger, fp);
            await markItem(fp, 'PUBLISHED', {
              title: extracted.title,
              content: extracted.content,
              postId: post.id,
              contentHash: publishHash,
              metadata: {
                quality: qualityAudit(quality),
                extraction: extractionAudit(extracted),
                publishContentHash: publishHash,
                reprocessedAt: new Date().toISOString(),
              },
            });
            schedulePostSideEffects(post.id);
            totals.delivered += 1;
            totals.latestTitle ||= extracted.title;
            items.push({ id: item.id, status: 'PUBLISHED', postId: post.id });
          } catch (error) {
            const message = errorText(error);
            totals.error += 1;
            await markItem(fp, 'FAILED', {
              error: message,
              contentHash: publishHash,
              metadata: { quality: qualityAudit(quality), publishContentHash: publishHash, reprocessedAt: new Date().toISOString() },
            });
            items.push({ id: item.id, status: 'FAILED', error: message });
          }
        }

        const run = await finishLoggedRun(logger, id, { status: totals.error ? 'PARTIAL_FAILED' : 'SUCCEEDED', ...totals });
        return { run, items, summary: totals };
      } finally {
        await logger.flush().catch(() => undefined);
      }
    }
