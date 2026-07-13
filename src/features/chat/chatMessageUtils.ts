import type {
  ChatEligibility,
  ChatMessage,
  ChatPostCreatedMetadata,
  ChatReplyCreatedMetadata,
  ChatReplyMetadata,
} from '@/types';
import { dedupeUnique, normalizeImageList } from '@/utils/media';

export function formatChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function getEligibilityText(eligibility: ChatEligibility | null) {
  if (!eligibility) return '';
  if (eligibility.canSend) return '';
  if (eligibility.reason === 'LOGIN_REQUIRED') return '登录后可查看发言资格';
  if (eligibility.reason === 'CHAT_MUTED') {
    if (!eligibility.muteExpiresAt) return '你已被聊天禁言';
    return `聊天禁言至 ${new Date(eligibility.muteExpiresAt).toLocaleString('zh-CN')}`;
  }
  if (eligibility.reason === 'ACCOUNT_DISABLED') return '账号已禁用，无法发言';
  if (eligibility.message?.includes('聊天室正在初始化')) return '';
  return '需注册满7天或付费用户可发言';
}

export function getComposerPlaceholder(canSend: boolean, eligibilityText: string) {
  if (canSend) return '说点什么';
  return eligibilityText || '需注册满7天或付费用户可发言';
}

function getOneLineMessageBody(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isPostCreatedMetadata(value: ChatMessage['metadata']): value is ChatPostCreatedMetadata {
  return Boolean(
    value &&
      value.kind === 'post_created' &&
      typeof (value as { postId?: unknown }).postId === 'string' &&
      (value as { postId?: string }).postId,
  );
}

function isChatReplyMetadata(value: ChatMessage['metadata']): value is ChatReplyCreatedMetadata {
  const replyTo = value && value.kind === 'chat_reply'
    ? (value as { replyTo?: unknown }).replyTo
    : null;
  return Boolean(
    replyTo &&
      typeof replyTo === 'object' &&
      typeof (replyTo as { messageId?: unknown }).messageId === 'string' &&
      (replyTo as { messageId?: string }).messageId,
  );
}

function getReplyPreview(message: ChatMessage) {
  const body = getOneLineMessageBody(message.body);
  if (body) return body.slice(0, 160);
  if (getPostCreatedMetadata(message)?.imageCount) return '图片动态';
  return '消息';
}

export function getPostCreatedMetadata(message: ChatMessage) {
  const metadata = message.metadata;
  if (!isPostCreatedMetadata(metadata)) return null;
  return metadata;
}

export function getChatPostImages(message: ChatMessage) {
  const metadata = getPostCreatedMetadata(message);
  if (!metadata) return [];
  return dedupeUnique(normalizeImageList(metadata.images));
}

export function getReplyMetadata(message: ChatMessage) {
  const metadata = message.metadata;
  if (!isChatReplyMetadata(metadata)) return null;
  return metadata.replyTo;
}

function getReplyImages(message: ChatMessage) {
  return getChatPostImages(message).slice(0, 4);
}

export function buildReplySnapshot(message: ChatMessage): ChatReplyMetadata {
  const images = getReplyImages(message);
  const postMetadata = getPostCreatedMetadata(message);
  return {
    messageId: message.id,
    authorName: String(message.authorName || '用户').trim() || '用户',
    bodyPreview: getReplyPreview(message),
    images,
    imageCount: Math.max(images.length, Number(postMetadata?.imageCount || 0)),
  };
}
