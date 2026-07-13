import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assertIncludes(file, source, pattern, message) {
  const ok = typeof pattern === 'string' ? source.includes(pattern) : pattern.test(source);
  if (!ok) {
    throw new Error(`${file}: ${message}`);
  }
}

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260825000000_add_post_quotes/migration.sql');
const bootstrap = read('server/bootstrap.ts');
const postReadRoutes = read('server/routes/post-read.routes.ts');
const postCreateRoutes = read('server/routes/post-create.routes.ts');
const quotePublishService = [
  read('server/services/quote-publish.service.ts'),
  read('server/services/quote-publish-v5.service.ts'),
  read('server/services/robot-content-generation.service.ts'),
  read('server/services/robot-reaction-quality.service.ts'),
].join('\n');
const postService = read('server/services/post/index.ts');
const postCard = read('src/features/post/PostCard.tsx');
const postCreate = [
  read('src/features/post-create/PostCreatePage.tsx'),
  read('src/features/post-create/postCreatePageSections.tsx'),
].join('\n');
const postDetail = [
  read('src/pages/PostDetail.tsx'),
  read('src/pages/PostDetailLegacy.tsx'),
  read('src/features/post-detail/PostDetailLegacySections.tsx'),
  read('src/features/post-detail/PostDetailInteractionsSection.tsx'),
  read('src/features/post-detail/postDetailLegacyUtils.ts'),
].join('\n');
const quotePreview = read('src/features/post/QuotedPostPreviewCard.tsx');
const quoteStyles = read('src/styles/components/post-quote.css');
const detailStyles = [
  read('src/styles/features/post-detail.css'),
  read('src/styles/features/post-detail-engagement.css'),
].join('\n');

assertIncludes('prisma/schema.prisma', schema, /^\s*quoteCount\s+Int\s+@default\(0\)/m, 'Post.quoteCount is required.');
assertIncludes('prisma/schema.prisma', schema, /^\s*quotedPostId\s+String\?/m, 'Post.quotedPostId is required.');
assertIncludes('prisma/schema.prisma', schema, '@relation("PostQuotes"', 'Post self relation for quotes is required.');
assertIncludes('prisma/schema.prisma', schema, 'idx_post_quote_visible_created', 'Visible quote index is required.');

assertIncludes('migration.sql', migration, 'ADD COLUMN IF NOT EXISTS "quoteCount"', 'quoteCount migration is required.');
assertIncludes('migration.sql', migration, 'ADD COLUMN IF NOT EXISTS "quotedPostId"', 'quotedPostId migration is required.');
assertIncludes('migration.sql', migration, 'Post_quotedPostId_fkey', 'quoted post foreign key is required.');
assertIncludes('migration.sql', migration, 'UPDATE "Post" AS target', 'quoteCount backfill is required.');

assertIncludes('server/routes/post-read.routes.ts', postReadRoutes, "app.get('/api/posts/:id/quotes'", 'quote list API route is required.');
assertIncludes('server/routes/post-create.routes.ts', postCreateRoutes, 'resolveQuotablePostMeta', 'quote creation must validate original post accessibility.');
assertIncludes('server/routes/post-create.routes.ts', postCreateRoutes, '引用发帖暂不支持上传图片', 'quote create API must reject images.');
assertIncludes('server/routes/post-create.routes.ts', postCreateRoutes, 'adjustPostQuoteCount', 'quote count updates are required.');
assertIncludes('server/routes/post-read.routes.ts', postReadRoutes, 'return res.json(safePosts)', 'quote list API must return an array body for the shared page fetcher.');
assertIncludes('quote publish sources', quotePublishService, /sourceBrief[\s\S]*cleanRobotReactionText\(post\.title[\s\S]*cleanRobotReactionText\(post\.content/, 'quote publish must sanitize source post text before prompting AI.');
assertIncludes('quote publish sources', quotePublishService, /author\."userType"::text <> 'ROBOT'/, 'quote publish must not quote robot-authored posts.');

assertIncludes('server/services/post/index.ts', postService, 'quotedPost: { select: quotePreviewSelect }', 'post payload must include quotedPost preview.');
assertIncludes('server/services/post/index.ts', postService, 'static async listPostQuotes', 'quote list service is required.');

assertIncludes('src/features/post/PostCard.tsx', postCard, 'PostQuoteSheet', 'post card must open quote sheet.');
assertIncludes('src/features/post/PostCard.tsx', postCard, 'QuotedPostPreviewCard', 'post card must render quoted preview.');
assertIncludes('src/features/post/QuotedPostPreviewCard.tsx', quotePreview, 'transformResize="contain"', 'quoted preview image must request a contained thumbnail.');
assertIncludes('src/styles/components/post-quote.css', quoteStyles, 'object-fit: contain', 'quoted preview image must not be cropped.');
assertIncludes('src/styles/components/post-quote.css', quoteStyles, /\.detail-quote-item-avatar[\s\S]*?var\(--ui-space-6\)/, 'shared quote item avatar must use compact list sizing.');
assertIncludes('src/styles/components/post-quote.css', quoteStyles, '.detail-quote-item-avatar.optimized-image', 'shared quote item image avatars must override the global optimized-image 100% sizing.');
assertIncludes('src/styles/components/post-quote.css', quoteStyles, '.quoted-post-preview-avatar.optimized-image', 'quoted preview image avatars must override the global optimized-image 100% sizing.');
assertIncludes('post detail sources', postDetail, 'usePostQuotes(postId, shouldLoadQuotes)', 'post detail must load quote posts for the bottom quote section.');
assertIncludes('post detail sources', postDetail, "HIDDEN_SOURCE_TEXTS = new Set(['quote_publish_robot', 'auto_post_curated_content'])", 'post detail must hide internal robot source markers.');
assertIncludes('post detail sources', postDetail, 'DetailQuoteItem', 'post detail must render quote posts at the bottom.');
assertIncludes('post detail sources', postDetail, 'detail-quotes-section', 'post detail quote section is required.');
assertIncludes('post detail styles', detailStyles, '.detail-quotes-section', 'post detail quote section styles are required.');
assertIncludes('src/styles/components/post-quote.css', quoteStyles, '.detail-quote-item-avatar', 'post detail and sheet quote item avatar sizing must stay shared.');
assertIncludes('post create sources', postCreate, /disabled=\{isQuoteMode \|\| isPublishingLocked\}[\s\S]*disabledReason=\{isQuoteMode \? '引用发布暂不添加图片' : '发布中暂不可添加图片'\}/, 'quote create page must disable image upload.');
assertIncludes('post create sources', postCreate, 'quotedPostId: isQuoteMode ? quotePostId : null', 'quote create payload must include quotedPostId.');

console.log('Post quote guards passed.');
