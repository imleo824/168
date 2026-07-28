const POST_CREATE_FOCUS_INTENT_KEY = 'post-create-focus-intent-at';
export const POST_CREATE_FOCUS_BRIDGE_ID = 'post-create-focus-bridge';
export const POST_CREATE_FOCUS_TRIGGER_ATTR = 'data-post-create-focus-trigger';
export const POST_CREATE_BRIDGE_RELEASE_MS = 160;
const POST_CREATE_FOCUS_INTENT_TTL_MS = 5000;

let lastFocusIntentAt = 0;
let bridgeReleaseTimer: number | null = null;

export function canUsePostCreateFocusDocument() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function writePostCreateFocusIntent() {
  if (!canUsePostCreateFocusDocument()) return;
  lastFocusIntentAt = Date.now();
  try {
    window.sessionStorage.setItem(POST_CREATE_FOCUS_INTENT_KEY, String(lastFocusIntentAt));
  } catch {
    // Session storage can be blocked; the in-memory timestamp still handles SPA navigation.
  }
}

function readFocusIntentAt() {
  if (!canUsePostCreateFocusDocument()) return 0;
  if (lastFocusIntentAt > 0) return lastFocusIntentAt;
  try {
    const stored = Number(window.sessionStorage.getItem(POST_CREATE_FOCUS_INTENT_KEY) || 0);
    lastFocusIntentAt = Number.isFinite(stored) ? stored : 0;
  } catch {
    lastFocusIntentAt = 0;
  }
  return lastFocusIntentAt;
}

export function shouldRestorePostCreateComposerFocus() {
  const intentAt = readFocusIntentAt();
  return intentAt > 0 && Date.now() - intentAt <= POST_CREATE_FOCUS_INTENT_TTL_MS;
}

export function clearPostCreateComposerFocusIntent() {
  lastFocusIntentAt = 0;
  if (!canUsePostCreateFocusDocument()) return;
  try {
    window.sessionStorage.removeItem(POST_CREATE_FOCUS_INTENT_KEY);
  } catch {
    // Ignore blocked storage.
  }
}

export function focusPostCreateTextareaElement(element: HTMLTextAreaElement) {
  element.focus({ preventScroll: true });
  try {
    const length = element.value.length;
    element.setSelectionRange(length, length);
  } catch {
    // Some engines can reject selection updates during focus handoff.
  }
}

export function clearPostCreateBridgeReleaseTimer() {
  if (bridgeReleaseTimer === null || !canUsePostCreateFocusDocument()) return;
  window.clearTimeout(bridgeReleaseTimer);
  bridgeReleaseTimer = null;
}

export function schedulePostCreateBridgeRelease() {
  if (!canUsePostCreateFocusDocument()) return;
  clearPostCreateBridgeReleaseTimer();
  bridgeReleaseTimer = window.setTimeout(() => {
    const bridge = document.getElementById(POST_CREATE_FOCUS_BRIDGE_ID);
    if (bridge && document.activeElement !== bridge) bridge.remove();
    bridgeReleaseTimer = null;
  }, POST_CREATE_BRIDGE_RELEASE_MS);
}
