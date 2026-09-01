import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const normalize = fs.readFileSync(path.join(root, 'server/services/auto-crawl-normalize.ts'), 'utf8');

assert.match(normalize, /export function normalizeAutoCrawlSourceValue/, 'source values must use one safe normalization function.');
assert.match(normalize, /BLOCKED_SOURCE_PROTOCOLS/, 'unsafe URL protocols must be rejected.');
assert.match(normalize, /isPrivateIpv4/, 'private IPv4 ranges must be rejected.');
assert.match(normalize, /isBlockedHost/, 'local and private hosts must be rejected.');
assert.match(normalize, /\['http:', 'https:'\]\.includes\(parsed\.protocol\)/, 'only HTTP and HTTPS sources are allowed.');
assert.match(normalize, /normalizeSource\([\s\S]*const source = normalizeAutoCrawlSourceValue\(raw\.source\)/, 'all source writes must use the same normalization entrypoint.');
assert.match(normalize, /export function normalizeCursor\(type: AutoCrawlSourceType, raw: unknown\)/, 'cursor normalization must use only live inputs.');
assert.match(normalize, /const cursor = normalizeCursor\(type, raw\.cursor\)/, 'source normalization must use the canonical cursor normalizer.');
assert.doesNotMatch(normalize, /normalizeSeed|shouldDisableSeedSource|categoryNameVariants|syncToTelegram|lastGapDetectedAt|lastGapMissingCount|toUnboundedInt/, 'deleted seed, compatibility and gap helpers must not return.');

console.log('[auto-crawl-source-normalize-guards] passed');