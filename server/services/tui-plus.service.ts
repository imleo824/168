import crypto from 'crypto';
import prisma, { isDbConfigured } from '../db';

const TUI_PLUS_STATUS = { TRIALING: 'TRIALING', ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', CANCELLED: 'CANCELLED' } as const;
const TUI_PLUS_PLAN = { TRIAL: 'TRIAL', MONTHLY: 'MONTHLY', YEARLY: 'YEARLY' } as const;
const TUI_PLUS_WEBSITE_STATUS = { ACTIVE: 'ACTIVE', PAUSED: 'PAUSED', EXPIRED: 'EXPIRED', FAILED: 'FAILED' } as const;
export const TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT = 1;
const TUI_PLUS_DEFAULTS = {
  rankingBoostPercent: 20,
  trialDays: 7,
  monthlyDays: 30,
  yearlyDays: 365,
  monthlyPricePoints: 1900,
  yearlyPricePoints: 19900,
  trialChannelLimit: 1,
  monthlyChannelLimit: TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT,
  yearlyChannelLimit: TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT,
  trialWebsiteLimit: 1,
  monthlyWebsiteLimit: TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT,
  yearlyWebsiteLimit: TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT,
  trialContactLimit: 1,
  monthlyContactLimit: 3,
  yearlyContactLimit: 5,
  pointsPerUsdt: 10,
} as const;
const TUI_PLUS_USAGE_COUNTED_STATUSES = new Set(['ACTIVE', 'PAUSED']);
const TUI_PLUS_CONFIG_KEYS = [
  'tui_plus_ranking_boost_percent',
  'tui_plus_trial_days',
  'tui_plus_monthly_duration_days',
  'tui_plus_yearly_duration_days',
  'tui_plus_monthly_price_points',
  'tui_plus_yearly_price_points',
  'tui_plus_yearly_discount_percent',
  'tui_plus_trial_channel_limit',
  'tui_plus_monthly_channel_limit',
  'tui_plus_yearly_channel_limit',
  'tui_plus_trial_website_limit',
  'tui_plus_monthly_website_limit',
  'tui_plus_yearly_website_limit',
  'tui_plus_trial_contact_limit',
  'tui_plus_monthly_contact_limit',
  'tui_plus_yearly_contact_limit',
] as const;

const TUI_PLUS_MEMBER_NAME = '推推会员';
const TUI_PLUS_REQUIRED_MESSAGE = `开通${TUI_PLUS_MEMBER_NAME}后才能使用该权益`;

type TuiPlusPlan = typeof TUI_PLUS_PLAN[keyof typeof TUI_PLUS_PLAN];
type TuiPlusStatus = typeof TUI_PLUS_STATUS[keyof typeof TUI_PLUS_STATUS];
type TuiPlusSnapshot = { active: boolean; status: TuiPlusStatus | 'NONE'; plan: TuiPlusPlan | null; expiresAt: Date | null; trialUsed: boolean };
type TuiPlusPlanBundle = Awaited<ReturnType<typeof getTuiPlusPlans>>;

export class TuiPlusError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const nowDate = () => new Date();
const addDays = (base: Date, days: number) => new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

function cleanString(raw: unknown, max = 80) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizePlan(raw: unknown): TuiPlusPlan | null {
  const plan = String(raw || '').trim().toUpperCase();
  if (plan === TUI_PLUS_PLAN.MONTHLY || plan === 'MONTH') return TUI_PLUS_PLAN.MONTHLY;
  if (plan === TUI_PLUS_PLAN.YEARLY || plan === 'YEAR' || plan === 'ANNUAL') return TUI_PLUS_PLAN.YEARLY;
  if (plan === TUI_PLUS_PLAN.TRIAL) return TUI_PLUS_PLAN.TRIAL;
  return null;
}

function normalizeStatus(raw: unknown): TuiPlusStatus | 'NONE' {
  const status = String(raw || '').trim().toUpperCase();
  return status === TUI_PLUS_STATUS.TRIALING || status === TUI_PLUS_STATUS.ACTIVE || status === TUI_PLUS_STATUS.EXPIRED || status === TUI_PLUS_STATUS.CANCELLED ? status : 'NONE';
}

function normalizeLinkStatus(raw: unknown) {
  return String(raw || '').trim().toUpperCase();
}

function isTuiPlusUsageCountedStatus(raw: unknown) {
  return TUI_PLUS_USAGE_COUNTED_STATUSES.has(normalizeLinkStatus(raw));
}

function toDateOrNull(raw: unknown) {
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(raw as any);
  const time = date.getTime();
  return Number.isFinite(time) ? date : null;
}

function normalizePositiveInt(raw: unknown, fallback: number, options: { min?: number; max?: number } = {}) {
  const parsed = Number(raw);
  let next = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  if (typeof options.min === 'number') next = Math.max(options.min, next);
  if (typeof options.max === 'number') next = Math.min(options.max, next);
  return next;
}

function getYearlyDiscountPercent(monthlyPrice: number, yearlyPrice: number) {
  const yearlyBase = monthlyPrice * 12;
  if (!Number.isFinite(yearlyBase) || yearlyBase <= 0) return 0;
  const discount = Math.round((1 - yearlyPrice / yearlyBase) * 100);
  return Math.min(90, Math.max(0, discount));
}

function inactiveStatusFromRaw(status: TuiPlusStatus | 'NONE') {
  if (status === TUI_PLUS_STATUS.CANCELLED) return TUI_PLUS_STATUS.CANCELLED;
  if (status === 'NONE') return 'NONE';
  return TUI_PLUS_STATUS.EXPIRED;
}

function activeFromRaw(row: any, now = nowDate()): TuiPlusSnapshot {
  const status = normalizeStatus(row?.plusStatus || row?.status);
  const plan = normalizePlan(row?.plusPlan || row?.plan);
  const expiresAt = toDateOrNull(row?.plusExpiresAt || row?.expiresAt);
  const active = Boolean(expiresAt && expiresAt.getTime() > now.getTime() && (status === TUI_PLUS_STATUS.TRIALING || status === TUI_PLUS_STATUS.ACTIVE));
  return { active, status: active ? status : inactiveStatusFromRaw(status), plan, expiresAt, trialUsed: Boolean(row?.plusTrialUsed) };
}

function assertUserCanUseTuiPlus(user: any, message = TUI_PLUS_REQUIRED_MESSAGE, now = nowDate()) {
  if (!user) throw new TuiPlusError(404, '用户不存在');
  if (user.isDisabled) throw new TuiPlusError(403, `您的账号已被禁用，无法使用${TUI_PLUS_MEMBER_NAME}`);
  const status = activeFromRaw(user, now);
  if (!status.active) throw new TuiPlusError(403, message);
  return status;
}

export async function isActiveTuiPlusUser(userId: string | null | undefined) {
  if (!userId || !isDbConfigured()) return false;
  const status = await getTuiPlusStatus(userId).catch((): null => null);
  return Boolean(status?.active);
}

function normalizeWebsiteUrl(input: unknown) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    const normalized = url.toString().replace(/\/$/, '');
    return normalized.length <= 500 ? normalized : '';
  } catch {
    return '';
  }
}

function websiteLabelFromUrl(url: string, rawLabel?: unknown) {
  const label = cleanString(rawLabel, 40);
  if (label) return label;
  try {
    return cleanString(new URL(url).hostname.replace(/^www\./i, ''), 40) || '网址';
  } catch {
    return '网址';
  }
}

async function readTuiPlusConfigOverrides() {
  if (!isDbConfigured()) return {} as Record<string, string>;
  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: [...TUI_PLUS_CONFIG_KEYS, 'recharge_points_per_usdt'] } },
      select: { key: true, value: true },
    });
    return Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
}

async function resolveTuiPlusPlanSource(configs?: any) {
  const overrides = await readTuiPlusConfigOverrides();
  return { ...(configs || {}), ...overrides };
}

function priceUsdtFromPoints(pricePoints: number, pointsPerUsdt: number) {
  if (!Number.isFinite(pricePoints) || !Number.isFinite(pointsPerUsdt) || pointsPerUsdt <= 0) return 0;
  return Math.floor((pricePoints / pointsPerUsdt) * 100) / 100;
}

function planFromBundle(plans: TuiPlusPlanBundle, plan: TuiPlusPlan | null) {
  if (plan === TUI_PLUS_PLAN.YEARLY) return plans.yearly;
  if (plan === TUI_PLUS_PLAN.MONTHLY) return plans.monthly;
  return plans.trial;
}

function singleProfileLinkLimit() {
  return TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT;
}

function rankingBoostMultiplierFromPercent(percent: unknown) {
  const value = normalizePositiveInt(percent, TUI_PLUS_DEFAULTS.rankingBoostPercent, { min: 0, max: 100 });
  return 1 + value / 100;
}

export async function getTuiPlusPlans(configs?: any) {
  const source = await resolveTuiPlusPlanSource(configs);
  const pointsPerUsdt = normalizePositiveInt(source.recharge_points_per_usdt, TUI_PLUS_DEFAULTS.pointsPerUsdt, { min: 1, max: 1_000_000 });
  const monthlyPrice = normalizePositiveInt(source.tui_plus_monthly_price_points, TUI_PLUS_DEFAULTS.monthlyPricePoints, { min: 1, max: 100_000_000 });
  const yearlyPrice = normalizePositiveInt(source.tui_plus_yearly_price_points, TUI_PLUS_DEFAULTS.yearlyPricePoints, { min: 1, max: 100_000_000 });
  const configuredDiscount = source.tui_plus_yearly_discount_percent;
  const yearlyDiscountPercent = Number.isFinite(Number(configuredDiscount))
    ? normalizePositiveInt(configuredDiscount, getYearlyDiscountPercent(monthlyPrice, yearlyPrice), { min: 0, max: 90 })
    : getYearlyDiscountPercent(monthlyPrice, yearlyPrice);
  const rankingBoostPercent = normalizePositiveInt(source.tui_plus_ranking_boost_percent, TUI_PLUS_DEFAULTS.rankingBoostPercent, { min: 0, max: 100 });

  const monthly = {
    plan: TUI_PLUS_PLAN.MONTHLY,
    label: '月付',
    pricePoints: monthlyPrice,
    priceUsdt: priceUsdtFromPoints(monthlyPrice, pointsPerUsdt),
    pointsPerUsdt,
    durationDays: normalizePositiveInt(source.tui_plus_monthly_duration_days, TUI_PLUS_DEFAULTS.monthlyDays, { min: 1, max: 3660 }),
    channelLimit: singleProfileLinkLimit(),
    websiteLimit: singleProfileLinkLimit(),
    contactLimit: normalizePositiveInt(source.tui_plus_monthly_contact_limit, TUI_PLUS_DEFAULTS.monthlyContactLimit, { min: 0, max: 100 }),
    rankingBoostPercent,
  };
  const yearly = {
    plan: TUI_PLUS_PLAN.YEARLY,
    label: '年付',
    pricePoints: yearlyPrice,
    priceUsdt: priceUsdtFromPoints(yearlyPrice, pointsPerUsdt),
    pointsPerUsdt,
    durationDays: normalizePositiveInt(source.tui_plus_yearly_duration_days, TUI_PLUS_DEFAULTS.yearlyDays, { min: 1, max: 3660 }),
    discountPercent: yearlyDiscountPercent,
    channelLimit: singleProfileLinkLimit(),
    websiteLimit: singleProfileLinkLimit(),
    contactLimit: normalizePositiveInt(source.tui_plus_yearly_contact_limit, TUI_PLUS_DEFAULTS.yearlyContactLimit, { min: 0, max: 100 }),
    rankingBoostPercent,
  };
  const trial = {
    plan: TUI_PLUS_PLAN.TRIAL,
    label: '免费试用',
    pricePoints: 0,
    priceUsdt: 0,
    pointsPerUsdt,
    durationDays: normalizePositiveInt(source.tui_plus_trial_days, TUI_PLUS_DEFAULTS.trialDays, { min: 1, max: 365 }),
    channelLimit: singleProfileLinkLimit(),
    websiteLimit: singleProfileLinkLimit(),
    contactLimit: normalizePositiveInt(source.tui_plus_trial_contact_limit, TUI_PLUS_DEFAULTS.trialContactLimit, { min: 0, max: 100 }),
    rankingBoostPercent,
  };

  return { monthly, yearly, trial };
}

export async function getTuiPlusStatus(userId: string): Promise<TuiPlusSnapshot> {
  if (!userId || !isDbConfigured()) return { active: false, status: 'NONE', plan: null, expiresAt: null, trialUsed: false };
  const rows = await prisma.$queryRaw<any[]>`
    SELECT "plusStatus", "plusPlan", "plusExpiresAt",
      ("plusTrialUsed" = true OR EXISTS (SELECT 1 FROM "TuiPlusSubscription" sub WHERE sub."userId" = "User"."id" LIMIT 1)) AS "plusTrialUsed"
    FROM "User"
    WHERE "id" = ${userId}
    LIMIT 1
  `;
  return activeFromRaw(rows[0]);
}

export async function listTuiPlusChannels(userId: string) {
  if (!userId || !isDbConfigured()) return [] as any[];
  return prisma.$queryRaw<any[]>`SELECT "id", "channelUrl", "channelHandle", "title", "sourceId", COALESCE("autoPostEnabled", false) AS "autoPostEnabled", "status", "lastCrawledAt", "lastError", "createdAt", "updatedAt" FROM "TuiPlusTelegramChannel" WHERE "userId" = ${userId} ORDER BY "createdAt" ASC, "id" ASC`;
}

export async function listTuiPlusWebsites(userId: string) {
  if (!userId || !isDbConfigured()) return [] as any[];
  return prisma.$queryRaw<any[]>`SELECT "id", "url", "label", "status", "createdAt", "updatedAt" FROM "TuiPlusWebsite" WHERE "userId" = ${userId} ORDER BY "createdAt" ASC, "id" ASC`;
}

export async function listTuiPlusContacts(userId: string) {
  if (!userId || !isDbConfigured()) return [] as any[];
  return prisma.$queryRaw<any[]>`SELECT "id", "contact", "contactUrl", "label", "status", "createdAt", "updatedAt" FROM "TuiPlusContact" WHERE "userId" = ${userId} ORDER BY "createdAt" ASC, "id" ASC`;
}

async function countActiveWebsites(tx: any, userId: string) {
  const rows = await tx.$queryRaw<any[]>`SELECT COUNT(*)::int AS count FROM "TuiPlusWebsite" WHERE "userId" = ${userId} AND "status" IN ('ACTIVE', 'PAUSED')`;
  return Number(rows[0]?.count || 0);
}

async function recordTuiPlusPointTransaction(tx: any, params: { userId: string; amount: number; description: string }) {
  await tx.$executeRaw`INSERT INTO "PointTransaction" ("id", "amount", "action", "description", "userId", "createdAt") VALUES (${crypto.randomUUID()}, ${params.amount}, 'TUI_PLUS'::"PointAction", ${params.description}, ${params.userId}, ${new Date()})`;
}

export async function startTuiPlusTrial(userId: string) {
  if (!userId || !isDbConfigured()) throw new TuiPlusError(503, '数据库未配置');
  const plans = await getTuiPlusPlans();
  const startedAt = nowDate();
  const expiresAt = addDays(startedAt, plans.trial.durationDays);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<any[]>`
      SELECT "plusTrialUsed", "plusStatus", "plusExpiresAt", "isDisabled",
        EXISTS (SELECT 1 FROM "TuiPlusSubscription" sub WHERE sub."userId" = "User"."id" LIMIT 1) AS "hasTuiPlusHistory"
      FROM "User"
      WHERE "id" = ${userId}
      FOR UPDATE
    `;
    const user = rows[0];
    if (!user) throw new TuiPlusError(404, '用户不存在');
    if (user.isDisabled) throw new TuiPlusError(403, '您的账号已被禁用，无法开通会员');
    const current = activeFromRaw(user, startedAt);
    if (current.active) throw new TuiPlusError(400, '当前已经是会员');
    if (user.plusTrialUsed || user.hasTuiPlusHistory) throw new TuiPlusError(400, '你已经使用过免费试用');
    await tx.$executeRaw`UPDATE "User" SET "plusStatus" = ${TUI_PLUS_STATUS.TRIALING}, "plusPlan" = ${TUI_PLUS_PLAN.TRIAL}, "plusExpiresAt" = ${expiresAt}, "plusTrialUsed" = true, "updatedAt" = ${startedAt} WHERE "id" = ${userId}`;
    await tx.$executeRaw`INSERT INTO "TuiPlusSubscription" ("id", "userId", "plan", "status", "startedAt", "expiresAt", "pricePaid", "createdAt", "updatedAt") VALUES (${crypto.randomUUID()}, ${userId}, ${TUI_PLUS_PLAN.TRIAL}, ${TUI_PLUS_STATUS.TRIALING}, ${startedAt}, ${expiresAt}, 0, ${startedAt}, ${startedAt})`;
    await recordTuiPlusPointTransaction(tx, { userId, amount: 0, description: `免费试用${TUI_PLUS_MEMBER_NAME} ${plans.trial.durationDays} 天` });
    return activeFromRaw({ plusStatus: TUI_PLUS_STATUS.TRIALING, plusPlan: TUI_PLUS_PLAN.TRIAL, plusExpiresAt: expiresAt, plusTrialUsed: true }, startedAt);
  });
}

export async function purchaseTuiPlus(userId: string, rawPlan: unknown, configs?: any) {
  if (!userId || !isDbConfigured()) throw new TuiPlusError(503, '数据库未配置');
  const plan = normalizePlan(rawPlan);
  if (plan !== TUI_PLUS_PLAN.MONTHLY && plan !== TUI_PLUS_PLAN.YEARLY) throw new TuiPlusError(400, '会员套餐不合法');
  const plans = await getTuiPlusPlans(configs);
  const planConfig = plan === TUI_PLUS_PLAN.YEARLY ? plans.yearly : plans.monthly;
  const now = nowDate();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<any[]>`SELECT "id", "points", "isDisabled", "plusStatus", "plusPlan", "plusExpiresAt", "plusTrialUsed" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = rows[0];
    if (!user) throw new TuiPlusError(404, '用户不存在');
    if (user.isDisabled) throw new TuiPlusError(403, '您的账号已被禁用，无法开通会员');
    const price = planConfig.pricePoints;
    if (!Number.isFinite(price) || price <= 0) throw new TuiPlusError(400, '会员价格配置无效');
    const current = activeFromRaw(user, now);
    const startAt = current.active && current.expiresAt ? current.expiresAt : now;
    const expiresAt = addDays(startAt, planConfig.durationDays);
    const chargeResult = await tx.user.updateMany({
      where: { id: userId, points: { gte: price } },
      data: {
        points: { decrement: price },
        plusStatus: TUI_PLUS_STATUS.ACTIVE,
        plusPlan: plan,
        plusExpiresAt: expiresAt,
        plusTrialUsed: true,
        updatedAt: now,
      },
    });
    if (chargeResult.count === 0) throw new TuiPlusError(402, `积分不足，开通 ${planConfig.label} 需要 ${price} 积分`);
    await tx.$executeRaw`INSERT INTO "TuiPlusSubscription" ("id", "userId", "plan", "status", "startedAt", "expiresAt", "pricePaid", "createdAt", "updatedAt") VALUES (${crypto.randomUUID()}, ${userId}, ${plan}, ${TUI_PLUS_STATUS.ACTIVE}, ${startAt}, ${expiresAt}, ${price}, ${now}, ${now})`;
    await recordTuiPlusPointTransaction(tx, { userId, amount: -price, description: `开通${TUI_PLUS_MEMBER_NAME} ${planConfig.label} ${price} 积分` });
    return { ...activeFromRaw({ plusStatus: TUI_PLUS_STATUS.ACTIVE, plusPlan: plan, plusExpiresAt: expiresAt, plusTrialUsed: true }, now), points: Number(user.points || 0) - price };
  });
}

export async function getTuiPlusChannelLimitForPlan(plan: unknown, configs?: any) {
  void plan;
  void configs;
  return singleProfileLinkLimit();
}

export async function addTuiPlusWebsite(userId: string, input: { url?: unknown; label?: unknown }) {
  if (!userId || !isDbConfigured()) throw new TuiPlusError(503, '数据库未配置');
  const url = normalizeWebsiteUrl(input.url);
  if (!url) throw new TuiPlusError(400, '请输入正确的网址');
  const label = websiteLabelFromUrl(url, input.label);
  return prisma.$transaction(async (tx) => {
    const userRows = await tx.$queryRaw<any[]>`SELECT "id", "isDisabled", "plusStatus", "plusPlan", "plusExpiresAt", "plusTrialUsed" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    assertUserCanUseTuiPlus(userRows[0], `开通${TUI_PLUS_MEMBER_NAME}后才能添加网址`);
    const limit = singleProfileLinkLimit();
    const currentCount = await countActiveWebsites(tx, userId);
    const existingRows = await tx.$queryRaw<any[]>`SELECT "id" FROM "TuiPlusWebsite" WHERE "userId" = ${userId} AND "url" = ${url} LIMIT 1`;
    if (!existingRows[0] && currentCount >= limit) throw new TuiPlusError(400, `会员主页最多添加 ${limit} 个网址链接`);
    const websiteId = existingRows[0]?.id || crypto.randomUUID();
    await tx.$executeRaw`INSERT INTO "TuiPlusWebsite" ("id", "userId", "url", "label", "status", "createdAt", "updatedAt") VALUES (${websiteId}, ${userId}, ${url}, ${label}, ${TUI_PLUS_WEBSITE_STATUS.ACTIVE}, ${nowDate()}, ${nowDate()}) ON CONFLICT ("userId", "url") DO UPDATE SET "label" = EXCLUDED."label", "status" = ${TUI_PLUS_WEBSITE_STATUS.ACTIVE}, "updatedAt" = EXCLUDED."updatedAt"`;
    const rows = await tx.$queryRaw<any[]>`SELECT "id", "url", "label", "status", "createdAt", "updatedAt" FROM "TuiPlusWebsite" WHERE "id" = ${websiteId} LIMIT 1`;
    return rows[0];
  });
}

export async function updateTuiPlusWebsite(userId: string, websiteId: string, input: { url?: unknown; label?: unknown; title?: unknown }) {
  if (!userId || !websiteId || !isDbConfigured()) throw new TuiPlusError(404, '链接不存在');
  const url = normalizeWebsiteUrl(input.url);
  if (!url) throw new TuiPlusError(400, '请输入正确的网址');
  const label = websiteLabelFromUrl(url, input.label || input.title);
  return prisma.$transaction(async (tx) => {
    const userRows = await tx.$queryRaw<any[]>`SELECT "id", "isDisabled", "plusStatus", "plusPlan", "plusExpiresAt", "plusTrialUsed" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    assertUserCanUseTuiPlus(userRows[0], `开通${TUI_PLUS_MEMBER_NAME}后才能编辑链接`);
    const currentRows = await tx.$queryRaw<any[]>`SELECT "id" FROM "TuiPlusWebsite" WHERE "id" = ${websiteId} AND "userId" = ${userId} FOR UPDATE`;
    if (!currentRows[0]) throw new TuiPlusError(404, '链接不存在');
    const duplicateRows = await tx.$queryRaw<any[]>`SELECT "id" FROM "TuiPlusWebsite" WHERE "userId" = ${userId} AND "url" = ${url} AND "id" <> ${websiteId} LIMIT 1`;
    if (duplicateRows[0]) throw new TuiPlusError(409, '该链接已经添加过');
    await tx.$executeRaw`UPDATE "TuiPlusWebsite" SET "url" = ${url}, "label" = ${label}, "status" = ${TUI_PLUS_WEBSITE_STATUS.ACTIVE}, "updatedAt" = ${nowDate()} WHERE "id" = ${websiteId} AND "userId" = ${userId}`;
    const rows = await tx.$queryRaw<any[]>`SELECT "id", "url", "label", "status", "createdAt", "updatedAt" FROM "TuiPlusWebsite" WHERE "id" = ${websiteId} LIMIT 1`;
    return rows[0];
  });
}

export async function deleteTuiPlusWebsite(userId: string, websiteId: string) {
  if (!userId || !websiteId || !isDbConfigured()) throw new TuiPlusError(404, '网址不存在');
  const rows = await prisma.$queryRaw<any[]>`DELETE FROM "TuiPlusWebsite" WHERE "id" = ${websiteId} AND "userId" = ${userId} RETURNING "id"`;
  if (!rows[0]) throw new TuiPlusError(404, '网址不存在');
  return { success: true };
}

export async function deleteTuiPlusContact(userId: string, contactId: string) {
  if (!userId || !contactId || !isDbConfigured()) throw new TuiPlusError(404, '联系方式不存在');
  const rows = await prisma.$queryRaw<any[]>`DELETE FROM "TuiPlusContact" WHERE "id" = ${contactId} AND "userId" = ${userId} RETURNING "id"`;
  if (!rows[0]) throw new TuiPlusError(404, '联系方式不存在');
  return { success: true };
}

export async function resolveTuiPlusTelegramSyncCost(userId: string | null | undefined, fallbackCost: number) {
  return await isActiveTuiPlusUser(userId) ? 0 : fallbackCost;
}

export function getTuiPlusRankingBoostMultiplier(userLike: any) {
  return activeFromRaw(userLike).active ? rankingBoostMultiplierFromPercent(userLike?.tuiPlusRankingBoostPercent ?? userLike?.rankingBoostPercent) : 1;
}

export async function buildTuiPlusStatusPayload(userId: string, configs?: any) {
  const plans = await getTuiPlusPlans(configs);
  const [status, channels, websites, contacts] = await Promise.all([getTuiPlusStatus(userId), listTuiPlusChannels(userId), listTuiPlusWebsites(userId), listTuiPlusContacts(userId)]);
  const currentPlan = planFromBundle(plans, status.plan);
  const visibleChannels = channels.slice(0, TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT);
  const visibleWebsites = websites.slice(0, TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT);
  return {
    ...status,
    benefits: {
      officialTelegramSync: status.active,
      ownTelegramAutoCrawl: status.active,
      profileWebsite: status.active,
      profileContact: status.active,
      promotionBooking: status.active,
      postContactUnlimited: status.active,
      postPromotionLink: status.active,
      rankingBoostPercent: status.active ? currentPlan.rankingBoostPercent : 0,
      avatarRing: status.active,
    },
    usage: {
      ownedChannelsUsed: Math.min(TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT, channels.filter((channel) => isTuiPlusUsageCountedStatus(channel.status)).length),
      ownedChannelsLimit: TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT,
      ownedWebsitesUsed: Math.min(TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT, websites.filter((website) => isTuiPlusUsageCountedStatus(website.status)).length),
      ownedWebsitesLimit: TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT,
      ownedContactsUsed: contacts.filter((contact) => isTuiPlusUsageCountedStatus(contact.status)).length,
      ownedContactsLimit: currentPlan.contactLimit,
    },
    plans,
    channels: visibleChannels,
    websites: visibleWebsites,
    contacts,
  };
}
