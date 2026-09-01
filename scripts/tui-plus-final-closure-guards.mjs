import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mustHave = (label, content, text) => assert.ok(content.includes(text), `${label} must include ${text}`);
const mustNotHave = (label, content, text) => assert.ok(!content.includes(text), `${label} must not include ${text}`);

const benefitService = read('server/services/tui-plus-benefits.service.ts');
const sharedBenefits = read('shared/tuiPlusBenefits.mjs');
const sharedBenefitsTypes = read('shared/tuiPlusBenefits.d.ts');
const clientBenefitCopies = read('src/features/tui-plus/tuiPlusBenefits.ts');
const clientTypes = read('src/types.ts');
const tuiPlusPage = read('src/pages/TuiPlusMobile.tsx');
const postCreateSections = read('src/features/post-create/postCreatePageSections.tsx');
const postCreatePage = read('src/features/post-create/PostCreatePage.tsx');
const postCreateRoutes = read('server/routes/post-create.routes.ts');
const postCard = read('src/features/post/PostCard.tsx');
const structuredMeta = read('src/utils/postStructuredMeta.ts');
const feedContentStyles = read('src/styles/components/feed-card-content.css');
const sharedPostPublishing = read('shared/postPublishing.ts');

mustHave('shared Tui Plus post promotion benefit', sharedBenefits, "key: 'postPromotionLink'");
mustHave('shared Tui Plus post promotion benefit', sharedBenefits, "title: '发帖直接设置推广链接'");
mustHave('shared Tui Plus post promotion benefit', sharedBenefits, "description: '点击到网址注册'");
mustHave('shared benefit type', sharedBenefitsTypes, "| 'postPromotionLink'");
mustHave('post promotion prompt copy title', clientBenefitCopies, "title: '推广链接是会员权益'");
mustNotHave('post promotion prompt copy subtitle', clientBenefitCopies, 'description:');
mustHave('post promotion prompt copy detail', clientBenefitCopies, "detail: '会员可在帖子中添加推广链接。'");
mustNotHave('post promotion prompt copy must not reuse benefit subtitle as dialog description', clientBenefitCopies, "点击到网址注册");

mustHave('server benefit flags', benefitService, "postPromotionLink: 'postPromotionLink'");
mustHave('server benefit payload', benefitService, '[TUI_PLUS_BENEFIT_FLAGS.postPromotionLink]: active');
mustHave('client status payload type', clientTypes, 'postPromotionLink?: boolean');
mustHave('member page fallback benefit', tuiPlusPage, 'postPromotionLink: false');
mustHave('member page icon contract', tuiPlusPage, 'postPromotionLink: <Link2 aria-hidden="true" />');

mustHave('post link editor member gate', postCreateSections, 'const tuiPlusActive = isTuiPlusActive(user);');
mustHave('post link editor member gate', postCreateSections, 'if (!tuiPlusActive) {');
mustHave('post link editor member prompt', postCreateSections, 'setIsLinkPromptOpen(true);');
mustHave('post link editor does not write body', postCreateSections, 'onPromotionLinkChange?.({ title: safeTitle, url: normalizedDraftLinkUrl })');
mustNotHave('post link editor must not append body line', postCreateSections, 'upsertPromotionLinkLine');
mustNotHave('post link editor must not append body line', postCreateSections, 'POST_LINK_LINE_PREFIX');

mustHave('post create structured link payload', postCreatePage, 'promotionLink: hasPromotionLink ? {');
mustHave('post create structured link payload', postCreatePage, 'promotionLinkTitle');
mustHave('post create structured link payload', postCreatePage, 'promotionLinkUrl');
mustHave('post create prompt', postCreateSections, 'benefit="postPromotionLink"');

mustHave('shared post promotion link key', sharedPostPublishing, "export const POST_PROMOTION_LINK_META_KEY = '__postPromotionLink'");
mustHave('post create backend structured link key', postCreateRoutes, 'POST_PROMOTION_LINK_META_KEY');
mustHave('post create backend membership guard', postCreateRoutes, 'POST_PROMOTION_LINK_MEMBER_MESSAGE');
mustHave('post create backend membership guard', postCreateRoutes, 'normalizedPromotionLink && !activeTuiPlus');
mustHave('post create backend saves structured link', postCreateRoutes, '[POST_PROMOTION_LINK_META_KEY]: normalizedPromotionLink');

mustHave('post card reads structured promotion link', postCard, "const POST_PROMOTION_LINK_META_KEY = '__postPromotionLink'");
mustHave('post card renders promotion link below media', postCard, 'postPromotionLink ? <PostPromotionLinkCard link={postPromotionLink} /> : null');
mustHave('post card uses lightweight post link structure', postCard, 'className="pressable post-card-promotion-link"');
mustHave('structured meta excludes promotion link', structuredMeta, 'isReservedStructuredMetaKey');
mustHave('structured meta excludes promotion link', structuredMeta, "key === POST_PROMOTION_LINK_META_KEY");
mustHave('feed promotion link scoped style', feedContentStyles, '.ins-post-card .post-card-promotion-link');

console.log('[tui-plus-final-closure-guards] passed');
