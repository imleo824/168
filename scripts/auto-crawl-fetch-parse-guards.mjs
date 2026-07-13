import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const main = fs.readFileSync(path.join(root, 'server/services/auto-crawl.service.ts'), 'utf8');
const fetchParse = fs.readFileSync(path.join(root, 'server/services/auto-crawl-fetch-parse.service.ts'), 'utf8');

assert.match(
  main,
  /from '\.\/auto-crawl-fetch-parse\.service'/,
  'auto-crawl main service must depend on the dedicated fetch/parse boundary.',
);

assert.match(
  main,
  /fetchAutoCrawlItems\(source, \{ maxItemsPerSource:/,
  'auto-crawl source processing must call the dedicated fetch/parse service.',
);

assert.match(
  main,
  /resolveAutoCrawlFetchUrl\(source\)/,
  'auto-crawl source logs must use the same fetch URL resolver as the fetch/parse service.',
);

assert.doesNotMatch(
  main,
  /async function fetchText|function parseRss|function parseTelegram|function splitTelegramBlocks|function extractImagesFromHtml/,
  'auto-crawl main service must not inline network fetching or parser logic.',
);

assert.match(
  fetchParse,
  /export async function fetchAutoCrawlItems/,
  'fetch/parse service must expose one high-level fetchAutoCrawlItems entrypoint.',
);

assert.match(fetchParse, /MAX_FETCH_BYTES/, 'fetch/parse service must enforce a maximum response size.');
assert.match(fetchParse, /isAllowedTextContentType/, 'fetch/parse service must validate response content type.');
assert.match(fetchParse, /timestampOf/, 'feed timestamps must be validated without inventing moving cursors.');
assert.match(fetchParse, /resolveAutoCrawlFetchUrl/, 'fetch/parse service must own the final source URL resolver.');
assert.match(fetchParse, /MAX_TELEGRAM_BACKFILL_PAGES/, 'Telegram history must be backfilled before cursor advancement.');
assert.match(fetchParse, /gapUnresolved/, 'unrecoverable Telegram history gaps must be explicitly represented in parser metadata.');
assert.match(main, /telegram_gap_partially_recovered/, 'partially recovered Telegram gaps must be persisted as source warnings.');
assert.doesNotMatch(fetchParse, /auto_crawl_telegram_gap_unresolved/, 'Telegram gaps must not permanently block a source after bounded backfill.');
assert.match(fetchParse, /RSS_CURSOR_SLOTS/, 'RSS items sharing a timestamp must receive stable distinct cursors.');
assert.match(fetchParse, /assertPublicHttpTarget/, 'every source and redirect target must pass DNS-level SSRF validation.');
assert.match(fetchParse, /redirect: 'manual'/, 'redirects must be explicitly validated.');
assert.match(fetchParse, /auto_crawl_parser_degraded_zero_items/, 'unexpected parser collapse must be observable.');

console.log('[auto-crawl-fetch-parse-guards] passed');
