#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function mustHave(label, source, text) {
  assert.ok(source.includes(text), `${label} must include ${text}`);
}

function mustNotHave(label, source, text) {
  assert.ok(!source.includes(text), `${label} must not include ${text}`);
}

function mustMatch(label, source, pattern) {
  assert.ok(pattern.test(source), `${label} must match ${pattern}`);
}

function mustRegisterAuthedRoute(label, source, route, method = 'post') {
  const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  mustMatch(
    label,
    source,
    new RegExp(`app\\.${method}\\('${escapedRoute}',[^;]+authMiddleware,\\s*mustAuth`, 's'),
  );
}

function mustRegisterAdminRoute(label, source, route, method = 'get') {
  const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  mustMatch(
    label,
    source,
    new RegExp(`app\\.${method}\\('${escapedRoute}',[^;]+authMiddleware,\\s*adminOnly`, 's'),
  );
}

const packageJson = read('package.json');
const accountAuthRoutes = read('server/routes/account-auth.routes.ts');
const accountRegistration = read('server/services/account-registration.service.ts');
const accountPasswordAuth = read('server/services/account-password-auth.service.ts');
const accountSettingsRoutes = read('server/routes/account-settings.routes.ts');
const userProfileSettings = read('server/services/user-profile-settings.service.ts');
const authContext = read('src/context/AuthContext.tsx');
const authModal = read('src/features/auth/AuthModal.tsx');
const postCreateRoutes = read('server/routes/post-create.routes.ts');
const postPublishContract = read('server/services/post/post-publish-contract.ts');
const postCreatePage = read('src/features/post-create/PostCreatePage.tsx');
const postCreateSections = read('src/features/post-create/postCreatePageSections.tsx');
const asyncFlow = read('src/hooks/useAsyncFlow.ts');
const billingRoutes = read('server/routes/billing.routes.ts');
const promotionRoutes = read('server/routes/promotion.routes.ts');
const promotionBooking = read('server/services/promotion-booking.service.ts');
const promotePage = read('src/features/promote/PromoteMobilePage.tsx');
const tuiPlusRoutes = read('server/routes/tui-plus.routes.ts');
const tuiPlusService = read('server/services/tui-plus.service.ts');
const tuiPlusPage = read('src/pages/TuiPlusMobile.tsx');
const referralRoutes = read('server/routes/referral.routes.ts');
const referralService = read('server/services/referral.service.ts');
const referralShared = read('shared/referral.ts');
const referralInviteCapture = read('src/app/useReferralInviteAttributionCapture.ts');
const referralInviteUtils = read('src/utils/referralInvite.ts');
const referralInvitePage = read('src/features/sponsor/ReferralInvitePageContent.tsx');

mustHave('package core journey script', packageJson, '"test:core-user-journey": "node scripts/core-user-journey-brutal-guards.mjs"');
mustHave('package all tests include core journey', packageJson, 'npm run test:core-user-journey');

mustHave('password login route rate-limit', accountAuthRoutes, "app.post('/api/auth/password', authLimiter");
mustHave('password register route rate-limit', accountAuthRoutes, "app.post('/api/auth/register', authLimiter");
mustHave('password login issues http-only session cookie', accountAuthRoutes, 'issueAuthSessionCookie(res, { userId: user.id, jwtSecret: JWT_SECRET });');
mustHave('password register issues http-only session cookie', accountAuthRoutes, 'issueAuthSessionCookie(res, { userId: user.id, jwtSecret: JWT_SECRET });');
mustHave('password register validates account format', accountAuthRoutes, 'validateLoginAccountForWrite(cleanUsername)');
mustHave('password register validates password strength', accountAuthRoutes, 'validateLoginPassword(password, cleanUsername)');
mustHave('password register rejects malformed invite code', accountAuthRoutes, "return res.status(400).json({ error: '邀请码格式不正确' });");
mustHave('password register normalizes invite source', accountAuthRoutes, 'inviteSource: normalizeReferralInviteSource(req.body?.inviteSource)');
mustNotHave('password register has no empty invite branch', accountRegistration, 'if (inviteCode) {\n    }');
mustHave('password register creates user and referral atomically', accountRegistration, 'return prisma.$transaction(async (tx) => {');
mustHave('password register binds invitation inside transaction', accountRegistration, 'await bindReferralRelationOnRegistration(tx, {');
mustHave('password register writes signup reward ledger', accountRegistration, 'TransactionAction.SIGNUP_REWARD');
mustHave('password login case-insensitive lookup', accountPasswordAuth, 'mode: \'insensitive\'');
mustHave('password login blocks disabled users', accountPasswordAuth, 'if (user.isDisabled)');
mustHave('password login verifies bcrypt hash', accountPasswordAuth, 'await bcrypt.compare(password, user.passwordHash)');
mustRegisterAuthedRoute('payment password route protected', accountSettingsRoutes, '/api/me/payment-password', 'put');
mustHave('payment password update validates route input length', accountSettingsRoutes, "return res.status(400).json({ error: '支付密码至少需要6位' });");
mustHave('payment password update verifies old password when present', userProfileSettings, 'const hasExistingPaymentPassword = Boolean(user?.paymentPasswordHash);');
mustHave('payment password update hashes secret', userProfileSettings, 'const paymentPasswordHash = await bcrypt.hash(password, 10);');

mustHave('auth context removes legacy token storage', authContext, "safeLocalStorage.removeItem('auth_token')");
mustHave('auth context clears all query caches on logout', authContext, 'queryClient.removeQueries();');
mustHave('auth context passes invite source on register', authContext, 'registerWithPasswordApi({ username, password, inviteCode, inviteSource })');
mustHave('auth modal login submit guarded', authModal, 'useInteractionGuard(submitPasswordLogin');
mustHave('auth modal register submit guarded', authModal, 'useInteractionGuard(submitPasswordRegister');
mustHave('auth modal requires agreement', authModal, 'if (!agreementAccepted)');
mustHave('auth modal restores invite attribution', authModal, 'readEffectiveReferralInvite()');
mustHave('auth modal clears invite after successful register', authModal, 'clearStoredReferralInvite();');

mustRegisterAuthedRoute('post create route protected', postCreateRoutes, '/api/posts');
mustHave('post create idempotency nonce normalized', postCreateRoutes, 'normalizePostClientNonce(req.body?.clientNonce || req.get(\'Idempotency-Key\') || req.get(\'X-Idempotency-Key\'))');
mustHave('post create locks author row', postCreateRoutes, 'FOR UPDATE');
mustHave('post create blocks disabled author', postCreateRoutes, "throw new PostCreateHttpError(403, '您的账号已被禁用，无法发布信息！')");
mustHave('post create uses shared publish contract', postCreateRoutes, 'preparePostPublishData({');
mustHave('post create validates content or image', postPublishContract, "if (!content && images.length === 0) throw new PostPublishError('content_empty'");
mustHave('post create enforces Tui Plus promotion link', postCreateRoutes, 'prepared.categoryMeta[POST_PROMOTION_LINK_META_KEY] && !activeTuiPlus');
mustHave('post create stores structured promotion link only', postPublishContract, '[POST_PROMOTION_LINK_META_KEY]: promotionLinkResult.link');
mustHave('post create front end sends client nonce', postCreatePage, 'clientNonce');
mustHave('post create front end uses async flow submit guard', postCreatePage, 'run: runSubmit');
mustHave('post create front end blocks busy submit', postCreatePage, 'disabled={submitDisabled}');
mustHave('shared async flow drops duplicate runs', asyncFlow, 'if (!mountedRef.current || inFlightRef.current || cooldownRef.current) return undefined;');
mustHave('post create front end member prompt for link', postCreateSections, 'benefit="postPromotionLink"');
mustHave('post create link editor checks active membership', postCreateSections, 'const tuiPlusActive = isTuiPlusActive(user);');

mustRegisterAuthedRoute('recharge order creation protected', billingRoutes, '/api/me/orders');
mustRegisterAuthedRoute('recharge scan protected', billingRoutes, '/api/me/orders/:id/scan');
mustHave('recharge order validates positive integer amount', billingRoutes, "return res.status(400).json({ error: '请输入整数充值金额' });");
mustHave('recharge order enforces configured minimum', billingRoutes, "return res.status(400).json({ error: `最低充值 ${minUsdt} USDT` });");
mustHave('recharge order replaces stale active order', billingRoutes, "statusReason: 'replaced_by_new_order'");
mustHave('recharge scan rejects foreign order lookup', billingRoutes, 'where: { id: req.params.id, userId: req.user.id }');
mustHave('recharge scan cooldown exists', billingRoutes, "reason: 'scan_cooldown'");

mustRegisterAuthedRoute('promotion slots protected', promotionRoutes, '/api/promotion/slots-batch', 'get');
mustRegisterAuthedRoute('promotion booking protected', promotionRoutes, '/api/promotion/book-batch');
mustHave('promotion route preflights membership', promotionRoutes, 'ensurePromotionBookingMember(user.id, res)');
mustHave('promotion booking verifies payment password before transaction', promotionBooking, 'const verifiedPaymentSnapshot = await verifyPaymentPasswordBeforeBooking(userId, params.paymentPassword);');
mustHave('promotion booking rechecks user under lock', promotionBooking, 'FOR UPDATE');
mustHave('promotion booking rechecks payment password snapshot', promotionBooking, 'assertPaymentPasswordSnapshotStillValid(user, verifiedPaymentSnapshot);');
mustHave('promotion booking enforces active membership under lock', promotionBooking, 'if (!isActiveTuiPlusForBooking(user)) throw new Error(PROMOTION_BOOKING_MEMBER_MESSAGE);');
mustHave('promotion booking charges points atomically', promotionBooking, 'where: { id: userId, points: { gte: totalPrice } }');
mustHave('promotion booking writes point transaction', promotionBooking, 'TransactionAction.AD');
mustHave('promote page uses async flow booking guard', promotePage, 'run: runConfirmBooking');
mustHave('promote page checks selected slots before charge', promotePage, 'const available = await ensureSelectedSlotsStillAvailable();');
mustHave('promote page requires payment password client-side', promotePage, 'const verifiedPaymentPassword = getVerifiedPaymentPassword();');

mustRegisterAuthedRoute('tui plus status protected', tuiPlusRoutes, '/api/tui-plus/status', 'get');
mustRegisterAuthedRoute('tui plus trial protected', tuiPlusRoutes, '/api/tui-plus/trial/start');
mustRegisterAuthedRoute('tui plus purchase protected', tuiPlusRoutes, '/api/tui-plus/purchase');
mustRegisterAuthedRoute('tui plus channels protected', tuiPlusRoutes, '/api/tui-plus/channels');
mustHave('tui plus trial locks user row', tuiPlusService, 'FOR UPDATE');
mustHave('tui plus trial blocks repeat eligibility', tuiPlusService, 'if (user.plusTrialUsed || user.hasTuiPlusHistory)');
mustHave('tui plus purchase locks user row', tuiPlusService, 'SELECT "id", "points", "isDisabled", "plusStatus", "plusPlan", "plusExpiresAt", "plusTrialUsed" FROM "User" WHERE "id" = ${userId} FOR UPDATE');
mustHave('tui plus purchase charges points atomically', tuiPlusService, 'where: { id: userId, points: { gte: price } }');
mustHave('tui plus purchase returns 402 on insufficient points', tuiPlusService, 'throw new TuiPlusError(402');
mustHave('tui plus purchase records ledger', tuiPlusService, 'recordTuiPlusPointTransaction(tx, { userId, amount: -price');
mustHave('tui plus page guards purchase', tuiPlusPage, 'useInteractionGuard(runPrimaryAction');
mustHave('tui plus page guards trial', tuiPlusPage, 'useInteractionGuard(startTrial');
mustHave('tui plus page routes guarded purchase click', tuiPlusPage, 'onClick={() => void guardedRunPrimaryAction()}');
mustHave('tui plus page routes guarded trial click', tuiPlusPage, 'onClick={() => void guardedStartTrial()}');

mustRegisterAuthedRoute('referral summary protected', referralRoutes, '/api/referrals/summary', 'get');
mustRegisterAuthedRoute('referral conversion protected', referralRoutes, '/api/referrals/convert-points');
mustRegisterAuthedRoute('referral withdrawal protected', referralRoutes, '/api/referrals/withdrawals');
mustRegisterAdminRoute('admin referral withdrawal protected', referralRoutes, '/api/admin/referral-withdrawals', 'get');
mustHave('referral binding rejects self invite', referralService, "if (referrerId === params.inviteeId)");
mustHave('referral commission idempotent per order', referralService, 'ON CONFLICT ("orderId") DO NOTHING');
mustHave('referral wallet uses advisory lock', referralService, 'pg_advisory_xact_lock');
mustHave('referral conversion locks wallet', referralService, 'await lockReferralWallet(tx, userId);');
mustHave('referral conversion writes user points and ledger', referralService, 'ReferralConversion');
mustHave('referral withdrawal verifies payment password', referralService, 'await verifyReferralWithdrawalPaymentPassword(userId, params.paymentPassword);');
mustHave('referral withdrawal validates TRC20 address', referralService, 'TRC20_ADDRESS_PATTERN');
mustHave('referral code ttl is seven days', referralShared, 'REFERRAL_INVITE_ATTRIBUTION_TTL_MS = 1000 * 60 * 60 * 24 * 7');
mustHave('referral capture reads current url attribution', referralInviteCapture, 'readReferralInviteFromCurrentUrl()');
mustHave('referral utility reads invite query keys', referralInviteUtils, 'readReferralInviteCodeFromSearch(window.location.search)');
mustHave('referral capture persists link source', referralInviteUtils, 'REFERRAL_INVITE_SOURCES.LINK');
mustHave('referral invite page guards withdrawal', referralInvitePage, 'useInteractionGuard(handleConfirmWithdrawal');
mustHave('referral invite page guards conversion', referralInvitePage, 'useInteractionGuard(handleConfirmConversion');

console.log('[core-user-journey-brutal-guards] passed');
