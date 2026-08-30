import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parseTelegram, selectAutoCrawlCandidates } from '../server/services/auto-crawl-fetch-parse.service';
import { filterCrawlContentBeforePublish } from '../server/services/crawl-content-quality.service';
import type { AutoCrawlItem, AutoCrawlSourceConfig } from '../server/services/auto-crawl.types';

const html = fs.readFileSync(new URL('./fixtures/telegram-channel-sample.html', import.meta.url), 'utf8');
const items = parseTelegram(html);
assert.equal(items.length, 2);
assert.equal(items[0].id, '101');
assert.match(items[0].content, /招聘开发工程师/);
assert.match(items[0].content, /地点[:：]金边/);
assert.doesNotMatch(items[0].content, /Forwarded from/);
assert.deepEqual(items[0].images, ['https://cdn.example/a.jpg', 'https://cdn.example/b.webp']);
assert.equal(filterCrawlContentBeforePublish(items[1]).reason, 'telegram_service_action');

const source = (patch: Partial<AutoCrawlSourceConfig> = {}): AutoCrawlSourceConfig => ({
  id: 'source-1',
  source: 'channel',
  type: 'telegram',
  sourceName: 'channel',
  categoryId: 'category-1',
  categoryName: '分类',
  authorUserId: 'user-1',
  showContact: false,
  disabled: false,
  cursor: '100',
  cursorKind: 'message_id',
  pollIntervalMinutes: 30,
  ...patch,
});
const message = (cursorNumber: number): AutoCrawlItem => ({
  id: String(cursorNumber),
  title: `消息${cursorNumber}`,
  content: `内容${cursorNumber}`,
  rawText: `内容${cursorNumber}`,
  link: `https://t.me/channel/${cursorNumber}`,
  timestamp: cursorNumber,
  datetime: '',
  cursorValue: String(cursorNumber),
  cursorNumber,
  images: [],
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => message(from + index));

const draining = selectAutoCrawlCandidates(range(700, 1000), source(), 20, {
  unresolved: true,
  backfillCandidateIds: new Set(range(700, 1000).map((item) => item.id)),
  backfillBeforeCursor: '700',
  backfillTargetCursor: '100',
});
assert.deepEqual(draining.items.map((item) => item.cursorNumber), range(700, 719).map((item) => item.cursorNumber));
assert.equal(draining.backfillBeforeCursor, null, 'must drain the channel head before advancing older pagination');
assert.equal(draining.backfillTargetCursor, '100');

const resuming = selectAutoCrawlCandidates(range(400, 699), source({
  cursor: '1000',
  backfillBeforeCursor: '700',
  backfillTargetCursor: '100',
}), 20, {
  unresolved: true,
  backfillCandidateIds: new Set(range(400, 699).map((item) => item.id)),
  backfillBeforeCursor: '400',
  backfillTargetCursor: '100',
});
assert.deepEqual(resuming.items.map((item) => item.cursorNumber), range(680, 699).reverse().map((item) => item.cursorNumber));
assert.equal(resuming.backfillBeforeCursor, '680');
assert.ok(resuming.items.every((item) => item.cursorNumber > 100), 'must not republish history below the original cursor');

const completed = selectAutoCrawlCandidates(range(95, 110), source({
  cursor: '1000',
  backfillBeforeCursor: '120',
  backfillTargetCursor: '100',
}), 20, {
  unresolved: false,
  backfillCandidateIds: new Set(range(95, 110).map((item) => item.id)),
  backfillBeforeCursor: null,
  backfillTargetCursor: null,
});
assert.deepEqual(completed.items.map((item) => item.cursorNumber), range(101, 110).reverse().map((item) => item.cursorNumber));
assert.equal(completed.backfillBeforeCursor, null);
assert.equal(completed.backfillTargetCursor, null);

console.log('auto crawl telegram fixture guards passed');
