import { type FormEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Info, MessageCircle, RefreshCw, Send, X } from 'lucide-react';
import type { ChatMessage } from '@/types';
import { useAuth } from '@/context/AuthContext';
import HomeAdBanner from '@/features/feed/HomeAdBanner';
import { formatOptionalOnlineCount } from '@/features/home/onlinePresence';
import { useHomeOnlineCount } from '@/features/home/useHomeOnlineCount';
import SEO from '@/platform/SEO';
import { useChatAds, useConfig } from '@/hooks/useData';
import { useScrollLock } from '@/utils/scrollLock';
import PageHeader from '@/ui/PageHeader';
import TopbarIconButton from '@/ui/TopbarIconButton';
import { TopbarOnlineBadge } from '@/ui/TopbarActions';
import { ChatMessageRow, ChatReplyQuote } from './ChatMessageRow';
import { buildReplySnapshot, getComposerPlaceholder, getEligibilityText } from './chatMessageUtils';
import { useChatLive } from './useChatLive';

type DocumentScrollSnapshot = {
  x: number;
  y: number;
};

type ChatOnlineCountConfig = {
  online_users_min?: number | null;
  online_users_max?: number | null;
};

const CHAT_SEND_DEDUPE_MS = 420;

function captureDocumentScrollSnapshot(): DocumentScrollSnapshot {
  return {
    x: window.scrollX || document.documentElement.scrollLeft || 0,
    y: window.scrollY || document.documentElement.scrollTop || 0,
  };
}

function restoreDocumentScrollSnapshot(snapshot: DocumentScrollSnapshot) {
  window.scrollTo(snapshot.x, snapshot.y);
}

function isStreamNearBottom(scroll: HTMLDivElement, threshold = 88) {
  return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= threshold;
}

export default function ChatPage() {
  const location = useLocation();
  const { user, requireAuth, showToast } = useAuth();
  const { data: config } = useConfig();
  const { data: chatAds = [] } = useChatAds();
  const [draft, setDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldStickToLatestRef = useRef(true);
  const hasScrolledToInitialLatestRef = useRef(false);
  const latestMessageIdRef = useRef<string | null>(null);
  const replyDocumentScrollSnapshotRef = useRef<DocumentScrollSnapshot | null>(null);
  const pendingReplyFocusRef = useRef(false);
  const lastReplySubmissionRef = useRef<{ body: string; replyTarget: ChatMessage } | null>(null);
  const lastReplySubmissionTimerRef = useRef<number | null>(null);
  const sendDedupeTimerRef = useRef<number | null>(null);
  const sendDedupeLockedRef = useRef(false);
  const onChatError = useCallback((message: string) => {
    sendDedupeLockedRef.current = false;
    if (sendDedupeTimerRef.current) {
      window.clearTimeout(sendDedupeTimerRef.current);
      sendDedupeTimerRef.current = null;
    }
    const lastReplySubmission = lastReplySubmissionRef.current;
    if (lastReplySubmission && message.includes('回复的消息')) {
      setDraft((current) => current || lastReplySubmission.body);
      setReplyTarget((current) => current || lastReplySubmission.replyTarget);
    }
    lastReplySubmissionRef.current = null;
    if (lastReplySubmissionTimerRef.current) {
      window.clearTimeout(lastReplySubmissionTimerRef.current);
      lastReplySubmissionTimerRef.current = null;
    }
    showToast(message, 'error');
  }, [showToast]);
  const {
    maxMessageLength,
    eligibility,
    connectionState,
    messages,
    isLoading,
    isFetchingOlder,
    hasOlderMessages,
    loadOlderMessages,
    sendMessage,
    refreshEligibility,
  } = useChatLive(onChatError, user);
  const onlineCountConfig = config as ChatOnlineCountConfig | undefined;
  const configuredOnlineCount = useHomeOnlineCount({
    min: onlineCountConfig?.online_users_min,
    max: onlineCountConfig?.online_users_max,
    enabled: Boolean(config),
  });

  const canUseComposer = Boolean(user && eligibility?.canSend);
  const canSubmit = canUseComposer && connectionState === 'open';
  const eligibilityText = getEligibilityText(eligibility);
  const draftMaxLength = Math.max(1, maxMessageLength);
  const onlineCountText = formatOptionalOnlineCount(configuredOnlineCount);
  const scrollChatToLatest = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.scrollTop = scroll.scrollHeight;
  }, []);

  useScrollLock(isRulesOpen, {
    fixed: true,
    allowTouchMove: (target) => target instanceof Element && Boolean(target.closest('[data-chat-rules-scroll]')),
  });

  const handleStreamScroll = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    shouldStickToLatestRef.current = isStreamNearBottom(scroll);
  }, []);

  const focusComposerInputWithoutPageScroll = useCallback((input: HTMLTextAreaElement) => {
    input.focus({ preventScroll: true });
  }, []);

  const handleComposerPointerDown = useCallback((event: ReactPointerEvent<HTMLTextAreaElement>) => {
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    const input = inputRef.current;
    if (input) focusComposerInputWithoutPageScroll(input);
  }, [focusComposerInputWithoutPageScroll]);

  useEffect(() => {
    if (isLoading || messages.length === 0) return;
    const latestMessageId = messages[messages.length - 1]?.id || null;
    const latestMessage = messages[messages.length - 1] || null;
    const isOwnLatestMessage = Boolean(user?.id && latestMessage?.authorUserId === user.id);
    const shouldScrollToLatest =
      !hasScrolledToInitialLatestRef.current ||
      (latestMessageIdRef.current !== latestMessageId && (shouldStickToLatestRef.current || isOwnLatestMessage));
    if (!shouldScrollToLatest) return;
    hasScrolledToInitialLatestRef.current = true;
    latestMessageIdRef.current = latestMessageId;
    const frame = window.requestAnimationFrame(scrollChatToLatest);
    return () => window.cancelAnimationFrame(frame);
  }, [isLoading, messages, scrollChatToLatest, user?.id]);

  useEffect(() => () => {
    if (lastReplySubmissionTimerRef.current) {
      window.clearTimeout(lastReplySubmissionTimerRef.current);
      lastReplySubmissionTimerRef.current = null;
    }
    if (sendDedupeTimerRef.current) {
      window.clearTimeout(sendDedupeTimerRef.current);
      sendDedupeTimerRef.current = null;
    }
    sendDedupeLockedRef.current = false;
  }, []);

  useEffect(() => {
    if (!replyTarget || !pendingReplyFocusRef.current) return undefined;
    pendingReplyFocusRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      const stream = scrollRef.current;
      const streamScrollTop = stream?.scrollTop ?? 0;
      if (input) focusComposerInputWithoutPageScroll(input);
      if (stream) stream.scrollTop = streamScrollTop;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusComposerInputWithoutPageScroll, replyTarget]);

  const handleReply = useCallback((message: ChatMessage) => {
    if (!user) {
      requireAuth(refreshEligibility);
      return;
    }
    if (!canUseComposer) {
      showToast(eligibilityText || '暂时无法发言', 'info');
      return;
    }
    const stream = scrollRef.current;
    const streamScrollTop = stream?.scrollTop ?? 0;
    replyDocumentScrollSnapshotRef.current = captureDocumentScrollSnapshot();
    pendingReplyFocusRef.current = true;
    flushSync(() => {
      setReplyTarget(message);
    });
    const input = inputRef.current;
    if (input) focusComposerInputWithoutPageScroll(input);
    if (stream) stream.scrollTop = streamScrollTop;
    window.requestAnimationFrame(() => {
      const snapshot = replyDocumentScrollSnapshotRef.current;
      if (snapshot) restoreDocumentScrollSnapshot(snapshot);
      if (stream) stream.scrollTop = streamScrollTop;
      replyDocumentScrollSnapshotRef.current = null;
    });
  }, [canUseComposer, eligibilityText, focusComposerInputWithoutPageScroll, refreshEligibility, requireAuth, showToast, user]);

  const submitDraft = useCallback(() => {
    if (sendDedupeLockedRef.current) return;
    const body = draft.trim();
    if (!body) return;
    if (!user) {
      requireAuth(refreshEligibility);
      return;
    }
    if (!canUseComposer) {
      showToast(eligibilityText || '暂时无法发言', 'info');
      return;
    }
    if (!canSubmit) {
      showToast('连接恢复后再发送', 'info');
      return;
    }
    const replyMetadata = replyTarget ? {
      kind: 'chat_reply' as const,
      replyTo: buildReplySnapshot(replyTarget),
    } : undefined;
    if (replyTarget) {
      lastReplySubmissionRef.current = { body, replyTarget };
      if (lastReplySubmissionTimerRef.current) window.clearTimeout(lastReplySubmissionTimerRef.current);
      lastReplySubmissionTimerRef.current = window.setTimeout(() => {
        lastReplySubmissionRef.current = null;
        lastReplySubmissionTimerRef.current = null;
      }, 15_000);
    } else {
      lastReplySubmissionRef.current = null;
    }
    sendDedupeLockedRef.current = true;
    const didSend = sendMessage(body, {
      replyToMessageId: replyTarget?.id || null,
      replyMetadata,
    });
    if (didSend) {
      shouldStickToLatestRef.current = true;
      setDraft('');
      setReplyTarget(null);
      if (sendDedupeTimerRef.current) window.clearTimeout(sendDedupeTimerRef.current);
      sendDedupeTimerRef.current = window.setTimeout(() => {
        sendDedupeLockedRef.current = false;
        sendDedupeTimerRef.current = null;
      }, CHAT_SEND_DEDUPE_MS);
      window.requestAnimationFrame(() => {
        scrollChatToLatest();
      });
    } else {
      lastReplySubmissionRef.current = null;
      sendDedupeLockedRef.current = false;
    }
  }, [
    canSubmit,
    canUseComposer,
    draft,
    eligibilityText,
    refreshEligibility,
    replyTarget,
    requireAuth,
    scrollChatToLatest,
    sendMessage,
    showToast,
    user,
  ]);

  const handleSubmit = useCallback((event: FormEvent) => {
    event.preventDefault();
    submitDraft();
  }, [submitDraft]);

  const handleComposerAccessRequest = useCallback(() => {
    if (!user) {
      requireAuth(refreshEligibility);
      return;
    }
    showToast(eligibilityText || '暂时无法发言', 'info');
  }, [eligibilityText, refreshEligibility, requireAuth, showToast, user]);

  const handleSendButtonPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') return;
    if (!canSubmit || !draft.trim()) return;
    event.preventDefault();
    submitDraft();
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) focusComposerInputWithoutPageScroll(input);
    });
  }, [canSubmit, draft, focusComposerInputWithoutPageScroll, submitDraft]);

  return (
    <section
      className="chat-page"
      data-contained-text-entry-surface="true"
    >
      <SEO title="聊天室｜推推" description="登录后加入聊天室、发布动态、与圈内用户对话。" noindex />
      <div className={`chat-shell${chatAds.length > 0 ? ' chat-shell--with-ad' : ''}`}>
        <PageHeader
          title="聊天"
          showBack={false}
          titleAlign="center"
          left={(
            <TopbarIconButton
              icon={<Info aria-hidden="true" />}
              onClick={() => setIsRulesOpen(true)}
              ariaLabel="聊天室规则"
              title="聊天室规则"
            />
          )}
          right={(
            <TopbarOnlineBadge countText={onlineCountText} />
          )}
        />

        {chatAds.length > 0 ? (
          <HomeAdBanner ads={chatAds} compact ariaLabel="聊天室置顶" />
        ) : null}

        <div className="chat-stream" ref={scrollRef} onScroll={handleStreamScroll}>
          <div className="chat-history-actions">
            {!isLoading && hasOlderMessages ? (
              <button
                type="button"
                className="chat-history-button"
                onClick={() => loadOlderMessages()}
                disabled={isFetchingOlder}
              >
                <RefreshCw aria-hidden="true" />
                <span>{isFetchingOlder ? '加载中' : '加载历史'}</span>
              </button>
            ) : null}
          </div>

          {isLoading ? (
            <div className="chat-stream-loading" aria-label="加载中" role="status">
              <span aria-hidden="true" />
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty-state">
              <span className="chat-empty-state-icon" aria-hidden="true">
                <MessageCircle />
              </span>
              <div className="chat-empty-state-copy">
                <h2>现在很安静</h2>
                <p>{user ? '有新消息时会出现在这里。' : '登录后可在满足条件时参与聊天。'}</p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessageRow
                key={message.id}
                message={message}
                isOwn={Boolean(user?.id && message.authorUserId === user.id)}
                location={location}
                onReply={handleReply}
              />
            ))
          )}
        </div>

        <form
          className="chat-composer"
          onSubmit={handleSubmit}
        >
          {replyTarget ? (
            <div className="chat-reply-context">
              <ChatReplyQuote replyTo={buildReplySnapshot(replyTarget)} context />
              <button
                type="button"
                className="chat-reply-clear"
                onClick={() => setReplyTarget(null)}
                aria-label="取消回复"
                title="取消回复"
              >
                <X aria-hidden="true" />
              </button>
            </div>
          ) : null}

          <div className="chat-input-row">
            {canUseComposer ? (
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, draftMaxLength))}
                onPointerDown={handleComposerPointerDown}
                placeholder={replyTarget ? `回复 ${replyTarget.authorName}` : getComposerPlaceholder(canUseComposer, eligibilityText)}
                rows={1}
                maxLength={draftMaxLength}
              />
            ) : (
              <button
                type="button"
                className="chat-input-gate"
                onClick={handleComposerAccessRequest}
                aria-label={getComposerPlaceholder(canUseComposer, eligibilityText)}
              >
                {getComposerPlaceholder(canUseComposer, eligibilityText)}
              </button>
            )}
            <button
              type="submit"
              className="chat-send-button"
              onPointerDown={handleSendButtonPointerDown}
              disabled={!draft.trim() || !canSubmit}
              aria-label="发送"
              title="发送"
            >
              <Send aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>

      {isRulesOpen && typeof document !== 'undefined' ? createPortal(
        <div className="chat-rules-overlay" role="presentation" onClick={() => setIsRulesOpen(false)}>
          <section
            className="chat-rules-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-rules-title"
            data-chat-rules-scroll
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-rules-handle" aria-hidden="true" />
            <div className="chat-rules-header">
              <h2 id="chat-rules-title">聊天室规则</h2>
              <TopbarIconButton
                icon={<X aria-hidden="true" />}
                onClick={() => setIsRulesOpen(false)}
                ariaLabel="关闭规则"
                title="关闭规则"
                className="chat-rules-close"
              />
            </div>
            <ul className="chat-rules-list">
              <li>友好聊天，禁止辱骂、骚扰、刷屏和恶意引战。</li>
              <li>不要发布手机号、账号、地址、验证码等隐私信息。</li>
              <li>禁止站外联系方式、交易引导、支付收款和违法内容。</li>
              <li>发言需登录，并满足充值成功或注册满 7 天。</li>
              <li>违规消息可能被隐藏，严重违规会被聊天室禁言。</li>
            </ul>
          </section>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
