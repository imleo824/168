import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatBootstrap, ChatEligibility, ChatMessage, User } from '@/types';
import { getChatBootstrap, getChatMessagesPage } from '@/services/api';

type ConnectionState = 'connecting' | 'open' | 'closed';

type SendMessageOptions = {
  replyToMessageId?: string | null;
  replyMetadata?: ChatMessage['metadata'];
};

type LiveEvent =
  | { type: 'chat.ready'; onlineCount: number; eligibility: ChatEligibility }
  | { type: 'presence.updated'; onlineCount: number }
  | { type: 'message.created'; message: ChatMessage }
  | { type: 'message.updated'; message: ChatMessage }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

function getChatWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/chat/live`;
}

const MAX_LIVE_MESSAGES = 160;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

function normalizeLiveOnlineCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : null;
}

function compareMessages(left: ChatMessage, right: ChatMessage) {
  const byTime = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  return byTime || left.id.localeCompare(right.id);
}

function mergeMessageSources(...sources: ChatMessage[][]) {
  const seen = new Set<string>();
  const confirmedClientNonces = new Set<string>();
  const byId = new Map<string, ChatMessage>();

  for (const messages of sources) {
    for (const message of messages) {
      if (!message?.id) continue;
      byId.set(message.id, message);
      if (!message.id.startsWith('local:') && message.clientNonce) confirmedClientNonces.add(message.clientNonce);
    }
  }

  const result: ChatMessage[] = [];
  for (const message of byId.values()) {
    if (!message?.id || message.id.startsWith('local:')) continue;
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    result.push(message);
  }

  for (const message of byId.values()) {
    if (!message?.id || seen.has(message.id)) continue;
    if (message.id.startsWith('local:') && message.clientNonce && confirmedClientNonces.has(message.clientNonce)) continue;
    seen.add(message.id);
    result.push(message);
  }
  return result.sort(compareMessages);
}

function appendLiveMessage(current: ChatMessage[], message: ChatMessage) {
  return mergeMessageSources(current, [message]).slice(-MAX_LIVE_MESSAGES);
}

function updateLiveMessage(current: ChatMessage[], message: ChatMessage) {
  return mergeMessageSources(current.map((item) => item.id === message.id ? message : item), [message]).slice(-MAX_LIVE_MESSAGES);
}

function getReconnectDelay(attempt: number) {
  const exponential = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** Math.min(attempt, 5));
  return exponential + Math.floor(Math.random() * 500);
}

export function useChatLive(onError?: (message: string) => void, currentUser?: User | null) {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const onErrorRef = useRef(onError);
  const pendingNoncesRef = useRef<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [eligibility, setEligibility] = useState<ChatEligibility | null>(null);
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const bootstrapQuery = useQuery<ChatBootstrap>({
    queryKey: ['chat', 'bootstrap'],
    queryFn: getChatBootstrap,
    staleTime: 5_000,
  });

  const messagesQuery = useInfiniteQuery({
    queryKey: ['chat', 'messages'],
    queryFn: ({ pageParam }) => getChatMessagesPage({ limit: 40, cursor: pageParam || null }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!bootstrapQuery.data) return;
    const nextOnlineCount = normalizeLiveOnlineCount(bootstrapQuery.data.onlineCount);
    if (nextOnlineCount != null) setOnlineCount(nextOnlineCount);
    setEligibility(bootstrapQuery.data.eligibility);
  }, [bootstrapQuery.data]);

  const historicalMessages = useMemo(() => {
    const pages = messagesQuery.data?.pages || [];
    return pages
      .slice()
      .reverse()
      .flatMap((page) => page.items.slice().reverse());
  }, [messagesQuery.data]);

  const messages = useMemo(
    () => mergeMessageSources(historicalMessages, liveMessages).filter((message) => message.status === 'VISIBLE'),
    [historicalMessages, liveMessages],
  );

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current || typeof window === 'undefined') return;
      setConnectionState('connecting');
      const socket = new WebSocket(getChatWsUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionState('open');
      };
      socket.onmessage = (event) => {
        let payload: LiveEvent | null = null;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (payload.type === 'chat.ready') {
          const nextOnlineCount = normalizeLiveOnlineCount(payload.onlineCount);
          if (nextOnlineCount != null) setOnlineCount(nextOnlineCount);
          setEligibility(payload.eligibility);
          return;
        }
        if (payload.type === 'presence.updated') {
          const nextOnlineCount = normalizeLiveOnlineCount(payload.onlineCount);
          if (nextOnlineCount != null) setOnlineCount(nextOnlineCount);
          return;
        }
        if (payload.type === 'message.created') {
          if (payload.message.clientNonce) {
            pendingNoncesRef.current = pendingNoncesRef.current.filter((nonce) => nonce !== payload.message.clientNonce);
          }
          setLiveMessages((current) => appendLiveMessage(current, payload.message));
          return;
        }
        if (payload.type === 'message.updated') {
          setLiveMessages((current) => updateLiveMessage(current, payload.message));
          void queryClient.invalidateQueries({ queryKey: ['chat', 'messages'] });
          return;
        }
        if (payload.type === 'error') {
          const failedNonce = pendingNoncesRef.current.pop();
          if (failedNonce) {
            setLiveMessages((current) => current.filter((message) => message.clientNonce !== failedNonce));
          }
          onErrorRef.current?.(payload.message || '聊天连接异常');
        }
      };
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        setConnectionState('closed');
        if (!mountedRef.current) return;
        const delayMs = getReconnectDelay(reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delayMs);
      };
      socket.onerror = () => {
        setConnectionState('closed');
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [queryClient]);

  const sendMessage = useCallback((body: string, options: SendMessageOptions = {}) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      onErrorRef.current?.('连接恢复后再发送');
      return false;
    }
    const clientNonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (currentUser?.id) {
      pendingNoncesRef.current.push(clientNonce);
      const optimisticMessage: ChatMessage = {
        id: `local:${clientNonce}`,
        roomId: bootstrapQuery.data?.room.id || 'public',
        authorType: 'USER',
        authorUserId: currentUser.id,
        botProfileId: null,
        authorName: String(currentUser.displayName || '用户').trim() || '用户',
        authorPhotoUrl: currentUser.photoUrl || null,
        authorIsTuiPlus: Boolean(currentUser.isTuiPlus) || undefined,
        authorPlusStatus: currentUser.plusStatus || undefined,
        authorPlusExpiresAt: currentUser.plusExpiresAt || undefined,
        body,
        status: 'VISIBLE',
        clientNonce,
        metadata: options.replyMetadata || undefined,
        createdAt: new Date().toISOString(),
      } as ChatMessage;
      setLiveMessages((current) => appendLiveMessage(current, optimisticMessage));
    }
    socket.send(JSON.stringify({
      type: 'message.create',
      body,
      clientNonce,
      replyToMessageId: options.replyToMessageId || undefined,
    }));
    return true;
  }, [bootstrapQuery.data?.room.id, currentUser?.displayName, currentUser?.id, currentUser?.isTuiPlus, currentUser?.photoUrl, currentUser?.plusExpiresAt, currentUser?.plusStatus]);

  const refreshEligibility = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['chat', 'bootstrap'] });
  }, [queryClient]);

  return {
    room: bootstrapQuery.data?.room || null,
    maxMessageLength: bootstrapQuery.data?.config.maxMessageLength || 500,
    eligibility,
    onlineCount,
    connectionState,
    messages,
    isLoading: bootstrapQuery.isLoading || messagesQuery.isLoading,
    isFetchingOlder: messagesQuery.isFetchingNextPage,
    hasOlderMessages: Boolean(messagesQuery.hasNextPage),
    loadOlderMessages: () => messagesQuery.fetchNextPage(),
    sendMessage,
    refreshEligibility,
  };
}
