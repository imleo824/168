type ScrollIntent =
  | 'return-restore'
  | 'route-overlay'
  | 'modal-open'
  | 'keyboard-resize'
  | 'tab-switch-top'
  | 'manual-refresh-top'
  | 'double-tap-top';

type ScrollIntentPriority = 1 | 2 | 3 | 4 | 5;

type ScrollIntentRecord = {
  intent: ScrollIntent;
  priority: ScrollIntentPriority;
  expiresAt: number;
};

const INTENT_PRIORITIES: Record<ScrollIntent, ScrollIntentPriority> = {
  'return-restore': 5,
  'route-overlay': 5,
  'modal-open': 4,
  'keyboard-resize': 4,
  'manual-refresh-top': 3,
  'tab-switch-top': 2,
  'double-tap-top': 1,
};

const DEFAULT_TTL_MS: Record<ScrollIntent, number> = {
  'return-restore': 1800,
  'route-overlay': 1200,
  'modal-open': 800,
  'keyboard-resize': 600,
  'manual-refresh-top': 800,
  'tab-switch-top': 800,
  'double-tap-top': 500,
};

let activeIntent: ScrollIntentRecord | null = null;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function readActiveIntent() {
  if (!activeIntent) return null;
  if (activeIntent.expiresAt <= now()) {
    activeIntent = null;
    return null;
  }
  return activeIntent;
}

export function beginScrollIntent(intent: ScrollIntent, ttlMs = DEFAULT_TTL_MS[intent]): (() => void) | undefined {
  const priority = INTENT_PRIORITIES[intent];
  const current = readActiveIntent();
  const expiresAt = now() + Math.max(0, ttlMs);

  if (current && current.priority > priority && current.expiresAt > expiresAt) {
    return;
  }

  activeIntent = { intent, priority, expiresAt };

  return () => {
    if (activeIntent?.intent === intent && activeIntent.expiresAt === expiresAt) {
      activeIntent = null;
    }
  };
}

export function hasBlockingScrollIntent(intent: ScrollIntent) {
  const current = readActiveIntent();
  if (!current) return false;
  return current.priority > INTENT_PRIORITIES[intent];
}

export function runWithScrollIntent<T>(intent: ScrollIntent, action: () => T, ttlMs?: number) {
  if (hasBlockingScrollIntent(intent)) return undefined;
  const end = beginScrollIntent(intent, ttlMs);
  try {
    return action();
  } finally {
    if (end) {
      window.setTimeout(end, Math.min(DEFAULT_TTL_MS[intent], ttlMs ?? DEFAULT_TTL_MS[intent]));
    }
  }
}

export function getActiveScrollIntent() {
  return readActiveIntent()?.intent || null;
}
