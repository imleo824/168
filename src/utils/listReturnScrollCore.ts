export const LIST_RETURN_RESTORE_EVENT = 'list-return-scroll:restore';

const LIST_RETURN_SCOPE_KEY = 'list_return_pending_scope';
const LIST_RETURN_TOP_PREFIX = 'list_return_scroll_top:';
const LIST_RETURN_RESTORE_SCOPE_KEY = 'list_return_restore_scope';
const LIST_RETURN_RESTORE_AT_KEY = 'list_return_restore_at';
const HISTORY_RETURN_SCOPE_KEY = '__listReturnScope';
const HISTORY_RETURN_TOP_KEY = '__listReturnTop';
const HISTORY_RETURN_EXPIRES_KEY = '__listReturnExpires';
const LIST_RETURN_TTL_MS = 5 * 60 * 1000;
const LIST_RETURN_RESTORE_REQUEST_TTL_MS = 2500;

export const LIST_RETURN_SOURCE_MAX_AGE_MS = 90 * 1000;

export type ReturnRecordSource = 'manual' | 'fallback';

export interface ListReturnRecordPayload {
  top: number;
  expiresAt: number;
  source?: ReturnRecordSource;
  updatedAt?: number;
}

export function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function normalizeListScope(scope: string) {
  if (!scope) return '';

  const [path, searchPart] = scope.split('?');
  if (!searchPart) return path || '';

  try {
    const search = new URLSearchParams(searchPart.startsWith('?') ? searchPart.slice(1) : searchPart);
    search.sort();
    const next = search.toString();
    return next ? `${path}?${next}` : path || '';
  } catch {
    const normalizedSearch = searchPart.replace(/^\?/, '');
    return normalizedSearch ? `${path}?${normalizedSearch}` : path || '';
  }
}

export function getCurrentListScope() {
  if (typeof window === 'undefined') return '';
  return normalizeListScope(`${window.location.pathname}${window.location.search}`);
}

export function buildRecord(source: ReturnRecordSource, top: number): ListReturnRecordPayload {
  const now = Date.now();
  return {
    top: Math.max(0, Math.round(top)),
    source,
    updatedAt: now,
    expiresAt: now + LIST_RETURN_TTL_MS,
  };
}

function parseRecord(value: string | null): ListReturnRecordPayload | null {
  if (!value) return null;
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as ListReturnRecordPayload;
      const top = Number(parsed?.top);
      const expiresAt = Number(parsed?.expiresAt);
      if (!Number.isFinite(top) || !Number.isFinite(expiresAt)) return null;
      return {
        top: Math.max(0, Math.round(top)),
        expiresAt,
        source: parsed?.source === 'fallback' ? 'fallback' : 'manual',
        updatedAt: Number.isFinite(Number(parsed?.updatedAt)) ? Math.round(Number(parsed.updatedAt)) : undefined,
      };
    } catch {
      return null;
    }
  }

  const legacyTop = Number(value);
  if (!Number.isFinite(legacyTop)) return null;
  return {
    top: Math.max(0, Math.round(legacyTop)),
    source: 'manual',
    updatedAt: Date.now(),
    expiresAt: Date.now() + LIST_RETURN_TTL_MS,
  };
}

function getTopKey(scope: string) {
  return `${LIST_RETURN_TOP_PREFIX}${scope}`;
}

export function readStoredRecord(scope: string): ListReturnRecordPayload | null {
  const storage = getStorage();
  if (!storage) return null;

  const raw = storage.getItem(getTopKey(scope));
  const record = parseRecord(raw);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    storage.removeItem(getTopKey(scope));
    if (storage.getItem(LIST_RETURN_SCOPE_KEY) === scope) {
      storage.removeItem(LIST_RETURN_SCOPE_KEY);
    }
    return null;
  }

  return record;
}

export function persistRecord(scope: string, payload: ListReturnRecordPayload) {
  const storage = getStorage();
  if (!storage) return;

  const record = {
    ...payload,
    top: Math.max(0, Math.round(payload.top)),
    source: payload.source || 'manual',
    updatedAt: payload.updatedAt ?? Date.now(),
    expiresAt:
      Number.isFinite(payload.expiresAt)
        ? Math.max(Date.now() + LIST_RETURN_TTL_MS, Math.round(payload.expiresAt))
        : Date.now() + LIST_RETURN_TTL_MS,
  };

  storage.setItem(LIST_RETURN_SCOPE_KEY, scope);
  storage.setItem(getTopKey(scope), JSON.stringify(record));
}

function getHistoryStateRecord() {
  if (typeof window === 'undefined') return null;
  const state = window.history.state;
  return state && typeof state === 'object' ? (state as Record<string, unknown>) : null;
}

function getRouterUserState(state: Record<string, unknown> | null) {
  const usr = state?.usr;
  return usr && typeof usr === 'object' ? (usr as Record<string, unknown>) : null;
}

export function writeHistoryReturnPosition(scope: string, top: number) {
  if (typeof window === 'undefined' || !scope) return;
  const expiresAt = Date.now() + LIST_RETURN_TTL_MS;

  try {
    const state = getHistoryStateRecord();
    const nextTop = Math.max(0, Math.round(top));

    if (state && 'usr' in state) {
      const usr = getRouterUserState(state) || {};
      window.history.replaceState(
        {
          ...state,
          usr: {
            ...usr,
            [HISTORY_RETURN_SCOPE_KEY]: scope,
            [HISTORY_RETURN_TOP_KEY]: nextTop,
            [HISTORY_RETURN_EXPIRES_KEY]: expiresAt,
          },
        },
        '',
      );
      return;
    }

    window.history.replaceState(
      {
        ...(state || {}),
        [HISTORY_RETURN_SCOPE_KEY]: scope,
        [HISTORY_RETURN_TOP_KEY]: nextTop,
        [HISTORY_RETURN_EXPIRES_KEY]: expiresAt,
      },
      '',
    );
  } catch {
    // History state writes are best-effort; sessionStorage remains the fallback.
  }
}

export function readHistoryReturnTop(scope: string) {
  const state = getHistoryStateRecord();
  if (!state || !scope) return null;

  const candidates = [getRouterUserState(state), state].filter(Boolean) as Array<Record<string, unknown>>;
  for (const candidate of candidates) {
    if (candidate[HISTORY_RETURN_SCOPE_KEY] !== scope) continue;
    const value = Number(candidate[HISTORY_RETURN_TOP_KEY]);
    const expiresAt = Number(candidate[HISTORY_RETURN_EXPIRES_KEY]);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) continue;
    if (Number.isFinite(value)) return Math.max(0, Math.round(value));
  }

  return null;
}

export function clearHistoryReturnTop(scope: string) {
  if (typeof window === 'undefined' || !scope) return;

  try {
    const state = getHistoryStateRecord();
    if (!state) return;

    if ('usr' in state) {
      const usr = getRouterUserState(state);
      if (!usr || usr[HISTORY_RETURN_SCOPE_KEY] !== scope) return;
      const nextUsr = { ...usr };
      delete nextUsr[HISTORY_RETURN_SCOPE_KEY];
      delete nextUsr[HISTORY_RETURN_TOP_KEY];
      delete nextUsr[HISTORY_RETURN_EXPIRES_KEY];
      window.history.replaceState({ ...state, usr: nextUsr }, '');
      return;
    }

    if (state[HISTORY_RETURN_SCOPE_KEY] !== scope) return;
    const nextState = { ...state };
    delete nextState[HISTORY_RETURN_SCOPE_KEY];
    delete nextState[HISTORY_RETURN_TOP_KEY];
    delete nextState[HISTORY_RETURN_EXPIRES_KEY];
    window.history.replaceState(nextState, '');
  } catch {
    // Ignore browser-specific restrictions while leaving storage cleanup intact.
  }
}

export function writeRestoreRequest(scope: string) {
  const storage = getStorage();
  const normalizedScope = normalizeListScope(scope);
  if (!storage || !normalizedScope) return;

  storage.setItem(LIST_RETURN_RESTORE_SCOPE_KEY, normalizedScope);
  storage.setItem(LIST_RETURN_RESTORE_AT_KEY, String(Date.now()));
}

export function hasRecentRestoreRequest(scope: string) {
  const storage = getStorage();
  const normalizedScope = normalizeListScope(scope);
  if (!storage || !normalizedScope) return false;

  const restoreScope = storage.getItem(LIST_RETURN_RESTORE_SCOPE_KEY);
  if (restoreScope !== normalizedScope) return false;

  const requestedAt = Number(storage.getItem(LIST_RETURN_RESTORE_AT_KEY));
  if (!Number.isFinite(requestedAt)) return false;

  if (Date.now() - requestedAt > LIST_RETURN_RESTORE_REQUEST_TTL_MS) {
    storage.removeItem(LIST_RETURN_RESTORE_SCOPE_KEY);
    storage.removeItem(LIST_RETURN_RESTORE_AT_KEY);
    return false;
  }

  return true;
}

export function clearRestoreRequest(scope: string) {
  const storage = getStorage();
  const normalizedScope = normalizeListScope(scope);
  if (!storage || !normalizedScope) return;

  if (storage.getItem(LIST_RETURN_RESTORE_SCOPE_KEY) !== normalizedScope) return;
  storage.removeItem(LIST_RETURN_RESTORE_SCOPE_KEY);
  storage.removeItem(LIST_RETURN_RESTORE_AT_KEY);
}

export function readPendingTop(scope: string) {
  const storage = getStorage();
  const normalizedScope = normalizeListScope(scope);
  if (!normalizedScope) return null;

  if (storage) {
    const storedScope = storage.getItem(LIST_RETURN_SCOPE_KEY);
    if (storedScope === normalizedScope) {
      const record = readStoredRecord(normalizedScope);
      const value = Number(record?.top);
      if (Number.isFinite(value)) return Math.max(0, Math.round(value));
    }
  }

  return readHistoryReturnTop(normalizedScope);
}

export function clearPendingTop(scope: string) {
  const storage = getStorage();
  const normalizedScope = normalizeListScope(scope);
  if (storage && normalizedScope) {
    if (storage.getItem(LIST_RETURN_SCOPE_KEY) === normalizedScope) {
      storage.removeItem(LIST_RETURN_SCOPE_KEY);
    }
    storage.removeItem(getTopKey(normalizedScope));
  }
  clearRestoreRequest(normalizedScope);
  clearHistoryReturnTop(normalizedScope);
}
