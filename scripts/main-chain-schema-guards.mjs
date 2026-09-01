#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.vite',
]);
const INCLUDED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.sql',
  '.prisma',
  '.json',
]);
const SELF = path.normalize('scripts/main-chain-schema-guards.mjs');
const OBSOLETE_POST_RANKING_FIELD = `ranking${'Value'}`;
const OBSOLETE_PLATFORM_AI_DISABLED_REASON = `platform_ai_${'disabled'}`;
const OBSOLETE_PLATFORM_KEY_READY_ENV = `PLATFORM_AI_${'ENABLED'}`;
const OBSOLETE_AUTO_KEY_READY_ENV = `AUTO_AI_${'ENABLED'}`;

const ALLOWED_PLATFORM_AI_DISABLED_REFERENCES = new Set([
  SELF,
]);

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(ROOT, absolute);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      yield* walk(absolute);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!INCLUDED_EXTENSIONS.has(path.extname(entry.name))) continue;
    yield relative;
  }
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function assertAbsent(file, content, token, message, allowedFiles = new Set()) {
  const normalized = path.normalize(file);
  if (allowedFiles.has(normalized)) return;
  if (!content.includes(token)) return;
  const line = content.slice(0, content.indexOf(token)).split('\n').length;
  fail(`${message}\n  - ${file}:${line}`);
}

function assertIncludes(file, content, token, message) {
  if (content.includes(token)) return;
  fail(`${message}\n  - ${file}`);
}

async function assertPlatformAiJsonModeContract() {
  const file = 'server/services/platform-ai-config.service.ts';
  const content = await fs.readFile(path.join(ROOT, file), 'utf8');
  assertIncludes(file, content, 'jsonMode?: boolean', 'Platform AI generation must expose jsonMode for structured-output callers.');
  assertIncludes(file, content, "responseMimeType: 'application/json'", 'Google platform AI calls must use responseMimeType=application/json when jsonMode is enabled.');
  assertIncludes(file, content, "response_format: { type: 'json_object' }", 'OpenAI-compatible platform AI calls must use response_format=json_object when jsonMode is enabled.');
}

async function assertAutomationAiJsonModeContract() {
  const file = 'server/services/automation-ai.service.ts';
  const content = await fs.readFile(path.join(ROOT, file), 'utf8');
  assertIncludes(file, content, 'jsonMode?: boolean', 'Automation AI runtime must pass jsonMode through to platform AI.');
  assertIncludes(file, content, 'jsonMode: input.jsonMode', 'Automation AI runtime must not drop jsonMode before platform AI.');
}

async function assertAutoCrawlAiParserContract() {
  const file = 'server/services/crawl-content-ai.service.ts';
  const content = await fs.readFile(path.join(ROOT, file), 'utf8');
  assertIncludes(file, content, 'parseStrictJsonObject', 'Auto-crawl AI extraction must parse model output as a strict JSON object.');
  assertIncludes(file, content, 'jsonMode: true', 'Auto-crawl AI extraction must request strict JSON mode from the model.');
  assertIncludes(file, content, 'temperature: 0', 'Auto-crawl AI extraction must use deterministic temperature.');
  assertIncludes(file, content, "enrichmentStatus: 'success' | 'failed' | 'invalid_json'", 'Auto-crawl AI extraction must audit successful, failed, and invalid JSON enrichment states.');
  assertIncludes(file, content, 'const aiRawMeta = objectValue(parsed?.meta)', 'Invalid or failed optional AI extraction must be isolated before standardization.');
  assertIncludes(file, content, 'buildRuleBasedCrawlMetaCandidates', 'Invalid or empty optional AI extraction must have a schema-bound rule fallback.');
  assertIncludes(file, content, 'ruleBasedFallbackRawMeta', 'Rule fallback must only fill fields that AI standardization did not already produce.');
  assertIncludes(file, content, 'title: cleanString(parsed?.title, 80) || fallbackTitle', 'Optional AI extraction must retain a deterministic title fallback.');
  assertIncludes(file, content, "extractor: 'ai_optional'", 'Auto-crawl AI must remain optional so content publication does not depend on AI availability.');
}

async function assertAutoCommentRankingContract() {
  const file = 'server/services/comment-publish-v8.service.ts';
  const content = await fs.readFile(path.join(ROOT, file), 'utf8');
  assertIncludes(file, content, 'LEFT JOIN "PostRankingScore" prs ON prs."postId" = p."id"', 'Auto-comment candidate SQL must join PostRankingScore for recommendation ordering.');
  assertIncludes(file, content, 'COALESCE(prs."recommendationScore", 0) AS "recommendationScore"', 'Auto-comment candidate SQL must select recommendationScore from PostRankingScore.');
  assertIncludes(file, content, 'ORDER BY COALESCE(prs."recommendationScore", 0) DESC, p."createdAt" DESC', 'Auto-comment candidate SQL must order by PostRankingScore.recommendationScore, not a Post column.');
}

async function assertPublicConfigNoDbFallbackContract() {
  const file = 'server/routes/config.routes.ts';
  const content = await fs.readFile(path.join(ROOT, file), 'utf8');
  assertIncludes(file, content, "import prisma, { isDbConfigured } from '../db';", 'Public config routes must know whether the database is configured before reading DB-backed category config.');
  assertIncludes(file, content, 'if (!isDbConfigured()) return [];', 'Admin category options must short-circuit when the database is not configured.');
  assertIncludes(file, content, 'if (!isDbConfigured()) return [] as PublishCategoryMetaConfig[];', 'Public category schema fallback must not query Prisma when the database is not configured.');
}

async function main() {
  for await (const file of walk(ROOT)) {
    const content = await fs.readFile(path.join(ROOT, file), 'utf8');
    assertAbsent(
      file,
      content,
      OBSOLETE_POST_RANKING_FIELD,
      `Obsolete Post ranking field detected. Use PostRankingScore.recommendationScore, never Post.${OBSOLETE_POST_RANKING_FIELD}.`,
    );
    assertAbsent(
      file,
      content,
      OBSOLETE_PLATFORM_AI_DISABLED_REASON,
      'Obsolete platform AI disabled reason detected. Platform AI readiness is key-only: use platform_ai_key_missing.',
      ALLOWED_PLATFORM_AI_DISABLED_REFERENCES,
    );
    assertAbsent(
      file,
      content,
      OBSOLETE_PLATFORM_KEY_READY_ENV,
      `Obsolete platform AI enabled env detected. ${OBSOLETE_PLATFORM_KEY_READY_ENV} is not part of runtime readiness.`,
    );
    assertAbsent(
      file,
      content,
      OBSOLETE_AUTO_KEY_READY_ENV,
      `Obsolete platform AI enabled env detected. ${OBSOLETE_AUTO_KEY_READY_ENV} is not part of runtime readiness.`,
    );
  }

  await assertPlatformAiJsonModeContract();
  await assertAutomationAiJsonModeContract();
  await assertAutoCrawlAiParserContract();
  await assertAutoCommentRankingContract();
  await assertPublicConfigNoDbFallbackContract();

  if (process.exitCode) return;
  console.log('[main-chain-schema-guards] passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
