
import { PromotionType, TransactionAction, UserType } from '../shared/domain';

export {
  ADMIN_TRANSACTION_TYPE_OPTIONS,
  ADMIN_USER_TYPE_FILTER_OPTIONS,
  PROMOTION_TYPE_LABELS,
  PROMOTION_TYPE_OPTIONS,
  TRANSACTION_ACTION_LABELS,
  TRANSACTION_ACTION_OPTIONS,
  USER_TYPE_LABELS,
  USER_TYPE_OPTIONS,
  UserType,
  getPromotionTypeLabel,
  getTransactionActionLabel,
  getUserTypeLabel,
  isPromotionTypeValue,
  isTransactionActionValue,
  isUserTypeValue,
  PromotionType,
  TransactionAction,
} from '../shared/domain';

export type TuiPlusPlan = 'TRIAL' | 'MONTHLY' | 'YEARLY';
export type TuiPlusStatus = 'NONE' | 'TRIALING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface TuiPlusTelegramChannel {
  id: string;
  channelUrl: string;
  channelHandle: string;
  title?: string | null;
  sourceId?: string | null;
  autoPostEnabled: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'FAILED';
  lastCrawledAt?: string | null;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TuiPlusWebsite {
  id: string;
  url: string;
  label: string;
  status: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'FAILED';
  createdAt?: string;
  updatedAt?: string;
}

export interface TuiPlusContact {
  id: string;
  contact: string;
  contactUrl?: string | null;
  label: string;
  status: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'FAILED';
  createdAt?: string;
  updatedAt?: string;
}

export interface TuiPlusStatusPayload {
  active: boolean;
  status: TuiPlusStatus;
  plan: TuiPlusPlan | null;
  expiresAt: string | null;
  trialUsed: boolean;
  benefits: {
    officialTelegramSync: boolean;
    ownTelegramAutoCrawl: boolean;
    profileWebsite?: boolean;
    profileContact?: boolean;
    promotionBooking?: boolean;
    postContactUnlimited?: boolean;
    postPromotionLink?: boolean;
    rankingBoostPercent: number;
    avatarRing: boolean;
  };
  usage: {
    ownedChannelsUsed: number;
    ownedChannelsLimit: number;
    ownedWebsitesUsed?: number;
    ownedWebsitesLimit?: number;
    ownedContactsUsed?: number;
    ownedContactsLimit?: number;
  };
  channels: TuiPlusTelegramChannel[];
  websites?: TuiPlusWebsite[];
  contacts?: TuiPlusContact[];
  plans?: Record<string, unknown>;
}

export interface Transaction {
  id: string;
  userId: string;
  action?: TransactionAction;
  amount: number;
  description: string;
  createdAt: string;
}

export type RechargeOrderStatus =
  | 'WAITING_PAYMENT'
  | 'MANUAL_REVIEW'
  | 'CREDITED'
  | 'EXPIRED'
  | 'BELOW_MINIMUM'
  | 'CANCELLED'
  | 'FAILED';

export interface RechargeOrder {
  id: string;
  txHash?: string | null;
  logIndex?: number | null;
  chain?: string | null;
  token?: string | null;
  toAddress?: string | null;
  usdtAmount: string | number;
  pointsGained: number;
  status: RechargeOrderStatus;
  statusReason?: string | null;
  scanExpiresAt?: string | null;
  scanAttempts?: number;
  autoCredit?: boolean;
  blockNumber?: string | number | null;
  blockTimestamp?: string | null;
  confirmedAt?: string | null;
  creditedAt?: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  displayName: string;
  username?: string;
  photoUrl?: string;
  coverUrl?: string | null;
  points: number;
  role: 'USER' | 'ADMIN';
  userType?: UserType;
  createdAt: string;
  updatedAt: string;
  postCount?: number;
  followingCount?: number;
  followerCount?: number;
  viewCount?: number;
  likeCount?: number;
  bio?: string;
  loginAccount?: string;
  contact?: string;
  hasPassword?: boolean;
  hasPaymentPassword?: boolean;
  plusStatus?: TuiPlusStatus;
  plusPlan?: TuiPlusPlan | null;
  plusExpiresAt?: string | null;
  plusTrialUsed?: boolean;
  isTuiPlus?: boolean;
  tuiPlusChannels?: TuiPlusTelegramChannel[];
  tuiPlusWebsites?: TuiPlusWebsite[];
  tuiPlusContacts?: TuiPlusContact[];
}

export interface PostLiker {
  id: string;
  displayName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  userType?: User['userType'];
  isTuiPlus?: boolean;
}

export interface PostLikeSummary {
  items: PostLiker[];
  total: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  order: number;
}

export type TelegramSyncStatus = 'NONE' | 'PENDING' | 'SENT' | 'FAILED';

export interface QuotePostPreview {
  id: string;
  title?: string;
  content?: string;
  images?: string[];
  createdAt?: string;
  userId?: string;
  user?: Partial<User> | null;
  isAnonymous?: boolean;
  isPublished?: boolean;
  deletedAt?: string | null;
  unavailable?: boolean;
}

export interface PublishCategoryMetaFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'location';
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface PublishCategoryMetaConfig {
  categorySlug?: string;
  schemaVersion?: number;
  id?: string;
  slug?: string;
  name?: string;
  fields: PublishCategoryMetaFieldConfig[];
}

export type CategoryMetaFeedFilterValue = string | boolean | { min?: number | string; max?: number | string };
export type CategoryMetaFeedFilters = Record<string, CategoryMetaFeedFilterValue>;

export interface LocationPresetConfig {
  country: string;
  cities: string[];
}

export interface JoinedTopic {
  id: string;
  name: string;
  type?: 'category' | 'topic';
  createdAt?: string;
  updatedAt?: string;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  location?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  source?: string | null;
  contact: string;
  categoryId?: string;
  category?: Category;
  images: string[];
  isPublished: boolean;
  deletedAt?: string | null;
  showContact?: boolean;
  syncToTelegram?: boolean;
  telegramSyncStatus?: TelegramSyncStatus;
  telegramSyncedAt?: string | null;
  telegramSyncRequestedAt?: string | null;
  telegramSyncLastError?: string | null;
  viewCount: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  quoteCount?: number;
  quotedPostId?: string | null;
  quotedPost?: QuotePostPreview | null;
  hasLiked?: boolean;
  heatScore?: number;
  relevanceScore?: number;
  isFeedPreview?: boolean;
  isPinned: boolean;
  isAnonymous?: boolean;
  pinSlot?: number;
  pinStartedAt?: string;
  pinExpiredAt?: string;
  bumpedAt?: string;
  createdAt: string;
  userId: string;
  user?: Partial<User>;
  categoryMeta?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface PromotionEffectStats {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  quotes: number;
}

export interface PromotionEffectAnalysisItem {
  key: string;
  campaignId?: string | null;
  bookingIds: string[];
  type: PromotionType;
  title: string;
  status: string;
  dateText: string;
  postId?: string | null;
  categoryId?: string | null;
  metrics: PromotionEffectStats;
}

export interface PromotionEffectDailyItem {
  date: string;
  metrics: PromotionEffectStats;
}

export interface PromotionEffectAnalysis {
  range: {
    startDate: string;
    endDate: string;
    timezone: string;
  };
  totals: PromotionEffectStats;
  dailyItems: PromotionEffectDailyItem[];
  items: PromotionEffectAnalysisItem[];
}

export type FeedTabId = 'following' | 'discover';

export interface FeedUpdateBadge {
  count: number;
  hasMore: boolean;
}

export type FeedBadgeCounts = Record<FeedTabId, FeedUpdateBadge>;

export interface HomeNotificationSummary {
  followStatus: { hasNew: boolean };
  feedCounts: FeedBadgeCounts;
}

export interface SystemConfigPrices {
  anonymous_publish?: number;
  ad_home_slot_1?: number;
  ad_home_slot_2?: number;
  ad_home_slot_3?: number;
  telegram_sync?: number;
  pin_home?: number;
  pin_category?: number;
  pin_chat?: number;
  ad_home?: number;
  [key: string]: number | undefined;
}

export interface SystemConfig {
  announcements: { id: string; text: string }[];
  prices: SystemConfigPrices;
  post_fee?: number;
  online_users_min?: number;
  online_users_max?: number;
  telegram_channel?: string;
  telegram_channels?: Record<string, string>;
  telegram_sync_require_image?: string;
  recharge_points_per_usdt?: number;
  tron_deposit_min_usdt?: number;
  tron_sweep_target_address?: string;
  recharge_usdt_address?: string;
  app?: {
    name?: string;
    slogan?: string;
    logo_url?: string;
  };
  location_presets?: LocationPresetConfig[];
  publish_category_schema?: PublishCategoryMetaConfig[];
}

export interface PromotionBooking {
  id: string;
  campaignId?: string;
  campaign?: Partial<PromotionCampaign> | null;
  type: PromotionType;
  targetDate: string;
  startsAt?: string;
  endsAt?: string;
  slotIndex?: number;
  scopeKey?: string;
  pricePaid: number;
  postId?: string;
  adImageUrl?: string | null;
  adMobileImageUrl?: string | null;
  adTargetUrl?: string | null;
  categoryId?: string | null;
  createdAt: string;
  updatedAt?: string;
  effectStats?: Partial<PromotionEffectStats> | null;
  post?: Post;
}

export interface PromotionCampaign {
  id: string;
  type: PromotionType;
  scopeKey?: string;
  postId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  adImageUrl?: string | null;
  adMobileImageUrl?: string | null;
  adTargetUrl?: string | null;
  startsAt: string;
  endsAt: string;
  totalPrice: number;
  bookings?: PromotionBooking[];
  createdAt: string;
  updatedAt?: string;
}

export interface HomeBootstrap {
  config: SystemConfig;
  categories: Category[];
  posts?: Post[];
  items?: Post[];
  homeAds?: PromotionBooking[];
  chatAds?: PromotionBooking[];
  notifications?: HomeNotificationSummary;
  notificationSummary?: HomeNotificationSummary;
  [key: string]: unknown;
}

export type ChatEligibilityReason =
  | 'OK'
  | 'LOGIN_REQUIRED'
  | 'ACCOUNT_DISABLED'
  | 'NEEDS_RECHARGE_OR_AGE'
  | 'CHAT_MUTED'
  | 'RATE_LIMITED';

export interface ChatEligibility {
  canSend: boolean;
  reason: ChatEligibilityReason;
  registeredAt?: string | null;
  hasCreditedOrder?: boolean;
  registeredDays?: number;
  muteExpiresAt?: string | null;
  message?: string;
}

export interface ChatConfig {
  enabled: boolean;
  minAccountAgeDays: number;
  retentionDays: number;
  maxMessageLength: number;
  aiEnabled: boolean;
  aiModel: string;
  botMaxPerMinute: number;
  botConcurrency: number;
  botCooldownSeconds: number;
  botReplyMinDelayMs: number;
  botReplyMaxDelayMs: number;
}

export interface ChatReplyMetadata {
  messageId: string;
  authorName: string;
  bodyPreview: string;
  images: string[];
  imageCount: number;
}

export type ChatPostCreatedMetadata = {
  kind: 'post_created';
  source: 'post_create';
  postId: string;
  title: string;
  images: string[];
  imageCount: number;
  isAnonymous: boolean;
  quotedPost?: QuotePostPreview | null;
  category?: Partial<Category> | null;
};

export type ChatReplyCreatedMetadata = {
  kind: 'chat_reply';
  replyTo: ChatReplyMetadata;
};

export type ChatMessageMetadata = ChatPostCreatedMetadata | ChatReplyCreatedMetadata | Record<string, unknown>;

export interface ChatMessage {
  id: string;
  roomId: string;
  authorType: 'USER' | 'BOT' | 'SYSTEM';
  authorUserId?: string | null;
  botProfileId?: string | null;
  authorName: string;
  authorPhotoUrl?: string | null;
  body: string;
  status: 'VISIBLE' | 'HIDDEN' | 'DELETED';
  clientNonce?: string | null;
  metadata?: ChatMessageMetadata | null;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface ChatBootstrap {
  config: Pick<ChatConfig, 'maxMessageLength' | 'aiEnabled'>;
  eligibility: ChatEligibility;
  room: {
    id: string;
    key: string;
    title: string;
  };
  onlineCount: number;
}
