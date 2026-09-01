export const PUBLIC_CHAT_ROOM_KEY = 'public';

export type ChatMessageAuthorType = 'USER' | 'BOT' | 'SYSTEM';
export type ChatMessageStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED';
export type ChatBotInvocationStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
export type ChatBotTrigger = 'HUMAN_MESSAGE' | 'IDLE_WARMUP';

export type ChatPostCreatedMetadata = {
  kind: 'post_created';
  source: 'post_create';
  postId: string;
  title: string;
  images: string[];
  imageCount: number;
  isAnonymous: boolean;
  quotedPost?: ChatQuotedPostPreview | null;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
};

export type ChatQuotedPostPreview = {
  id: string;
  title?: string;
  content?: string;
  images?: string[];
  createdAt?: string | null;
  userId?: string | null;
  user?: {
    id?: string;
    displayName?: string | null;
    username?: string | null;
    photoUrl?: string | null;
    userType?: string | null;
  } | null;
  isAnonymous?: boolean;
  isPublished?: boolean;
  deletedAt?: string | null;
  unavailable?: boolean;
};

export type ChatReplyMetadata = {
  messageId: string;
  authorName: string;
  bodyPreview: string;
  images: string[];
  imageCount: number;
};

export type ChatReplyCreatedMetadata = {
  kind: 'chat_reply';
  replyTo: ChatReplyMetadata;
};

export type ChatMessageMetadata = ChatPostCreatedMetadata | ChatReplyCreatedMetadata;

export type ChatUserSnapshot = {
  id: string;
  displayName: string;
  photoUrl: string | null;
  createdAt?: Date | string | null;
  isDisabled?: boolean;
};

export type ChatMessagePayload = {
  id: string;
  roomId: string;
  authorType: ChatMessageAuthorType;
  authorUserId: string | null;
  botProfileId: string | null;
  authorName: string;
  authorPhotoUrl: string | null;
  body: string;
  status: ChatMessageStatus;
  clientNonce?: string | null;
  metadata?: ChatMessageMetadata | null;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
};

export type ChatBotProfilePayload = {
  id: string;
  authorUserId?: string | null;
  botProfileId?: string | null;
  displayName: string;
  photoUrl: string | null;
  persona: string;
  isEnabled: boolean;
  weight: number;
  cooldownSeconds: number;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatEligibilityReason =
  | 'OK'
  | 'LOGIN_REQUIRED'
  | 'ACCOUNT_DISABLED'
  | 'NEEDS_RECHARGE_OR_AGE'
  | 'CHAT_MUTED'
  | 'RATE_LIMITED';

export type ChatEligibility = {
  canSend: boolean;
  reason: ChatEligibilityReason;
  registeredAt?: string | null;
  hasCreditedOrder?: boolean;
  registeredDays?: number;
  muteExpiresAt?: string | null;
  message?: string;
};

export type ChatConfig = {
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
};

export type ChatGatewayClientUser = {
  id: string;
  role?: string;
  isDisabled?: boolean;
  displayName?: string;
  photoUrl?: string | null;
};

export type ChatLiveInbound =
  | { type: 'message.create'; body?: unknown; clientNonce?: unknown; replyToMessageId?: unknown }
  | { type: 'ping' };

export type ChatLiveOutbound =
  | { type: 'chat.ready'; onlineCount: number; eligibility: ChatEligibility }
  | { type: 'presence.updated'; onlineCount: number }
  | { type: 'message.created'; message: ChatMessagePayload }
  | { type: 'message.updated'; message: ChatMessagePayload }
  | { type: 'error'; code: ChatEligibilityReason | 'INVALID_MESSAGE' | 'SERVER_ERROR'; message: string }
  | { type: 'pong' };
