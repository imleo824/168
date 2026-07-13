import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const schemaPath = path.join(rootDir, 'prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');

function fail(message) {
  console.error(`[prisma-schema-trusted-engagement] ${message}`);
  process.exitCode = 1;
}

function mustContain(needle, message) {
  if (!schema.includes(needle)) fail(message);
}

mustContain('postViews           PostView[]                   @relation("PostViewViewer")', 'User must expose PostView viewer relation.');
mustContain('viewerUserId String?', 'PostView must declare viewerUserId.');
mustContain('viewerUser   User?    @relation("PostViewViewer", fields: [viewerUserId], references: [id], onDelete: SetNull)', 'PostView must relate viewerUserId to User.');
mustContain('@@index([viewerUserId, createdAt(sort: Desc)], map: "idx_post_view_viewer_user_created")', 'PostView viewerUserId index is missing.');
mustContain('@@index([postId, viewerUserId, createdAt(sort: Desc)], map: "idx_post_view_post_viewer_user_created")', 'PostView post/viewerUserId index is missing.');

for (const field of [
  'normalLikeCount',
  'normalViewCount',
  'normalShareCount',
  'normalCommentCount',
  'normalQuoteCount',
  'normalDwellMs',
  'normalQuickSkipCount',
]) {
  mustContain(field, `PostEngagementAggregate must declare ${field}.`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('[prisma-schema-trusted-engagement] OK');
