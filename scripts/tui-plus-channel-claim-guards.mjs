import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mustHave = (label, content, text) => assert.ok(content.includes(text), `${label} must include ${text}`);

const channelService = read('server/services/tui-plus-channel.service.ts');

mustHave('existing source lookup', channelService, 'findExistingAutoCrawlSource');
mustHave('new source reachability gate', channelService, 'assertNewTelegramSourceReachable');
mustHave('new source reachability gate', channelService, 'if (!existingSource?.id) await assertPublicTelegramChannelReachable(crawlUrl)');
mustHave('add channel reachability gate', channelService, 'await assertNewTelegramSourceReachable(crawlUrl)');
mustHave('claim still owns future attribution', channelService, '"authorUserId" = ${params.userId}');
mustHave('claim still owns future attribution', channelService, '"ownerUserId" = ${params.userId}');
mustHave('member-owned source still blocked', channelService, 'throw new TuiPlusError(409, MEMBER_OWNED_SOURCE_MESSAGE)');
mustHave('existing posts not migrated', channelService, 'Existing posts are intentionally not updated');

console.log('[tui-plus-channel-claim-guards] passed');
