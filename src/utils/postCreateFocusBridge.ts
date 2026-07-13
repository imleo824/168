const POST_CREATE_FOCUS_INTENT_KEY = 'post-create-focus-intent-at';
const POST_CREATE_FOCUS_BRIDGE_ID = 'post-create-focus-bridge';
const POST_CREATE_FOCUS_INTENT_TTL_MS = 5000;
const POST_CREATE_BRIDGE_RELEASE_MS = 160;
export const POST_CREATE_FOCUS_TRIGGER_ATTR = 'data-post-create-focus-trigger';

let lastFocusIntentAt = 0;
let bridgeReleaseTimer: number | null = null;

function canUseDocument() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isMobileKeyboardEnvironment() {
  if (!canUseDocument()) return false;
  const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return Boolean(coarsePointer || mobileAgent);
}

function writeFocusIntent() {
  if (!canUseDocument()) return;
  lastFocusIntentAt = Date.now();
  try {
    window.sessionStorage.setItem(POST_CREATE_FOCUS_INTENT_KEY, String(lastFocusIntentAt));
  } catch {
    // Session storage can be blocked; the in-memory timestamp still handles SPA navigation.
  }
}

function readFocusIntentAt() {
  if (!canUseDocument()) return 0;
  if (lastFocusIntentAt > 0) return lastFocusIntentAt;
  try {
    const stored = Number(window.sessionStorage.getItem(POST_CREATE_FOCUS_INTENT_KEY) || 0);
    lastFocusIntentAt = Number.isFinite(stored) ? stored : 0;
  } catch {
    lastFocusIntentAt = 0;
  }
  return lastFocusIntentAt;
}

function getFocusBridgeTextarea() {
  let textarea = document.getElementById(POST_CREATE_FOCUS_BRIDGE_ID) as HTMLTextAreaElement | null;
  if (textarea) return textarea;

  textarea = document.createElement('textarea');
  textarea.id = POST_CREATE_FOCUS_BRIDGE_ID;
  textarea.tabIndex = -1;
  textarea.autocomplete = 'off';
  textarea.autocapitalize = 'none';
  textarea.spellcheck = false;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.setAttribute('inputmode', 'text');
  textarea.setAttribute('data-post-create-focus-bridge', 'true');
  Object.assign(textarea.style, {
    position: 'fixed',
    insetInlineStart: '0',
    insetBlockEnd: '0',
    width: '1px',
    height: '1px',
    minWidth: '1px',
    minHeight: '1px',
    opacity: '0.01',
    pointerEvents: 'none',
    border: '0',
    borderRadius: '0',
    padding: '0',
    background: 'transparent',
    color: 'transparent',
    caretColor: 'transparent',
    fontSize: '16px',
    lineHeight: '16px',
    resize: 'none',
    zIndex: '2147483647',
  });
  document.body.appendChild(textarea);
  return textarea;
}

function focusElement(element: HTMLTextAreaElement) {
  element.focus({ preventScroll: true });
  try {
    const length = element.value.length;
    element.setSelectionRange(length, length);
  } catch {
    // Some engines can reject selection updates during focus handoff.
  }
}

function isCreateHref(href: string | null | undefined) {
  if (!href || !canUseDocument()) return false;

  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin && url.pathname.replace(/\/+$/, '') === '/create';
  } catch {
    return false;
  }
}

function findCreateAnchor(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor) return null;
  if (anchor.hasAttribute('download')) return null;
  const targetAttr = anchor.getAttribute('target');
  if (targetAttr && targetAttr !== '_self') return null;
  return isCreateHref(anchor.getAttribute('href')) || isCreateHref(anchor.href) ? anchor : null;
}

function findPostCreateFocusTrigger(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(`[${POST_CREATE_FOCUS_TRIGGER_ATTR}]`);
}

function shouldPrimeForTarget(target: EventTarget | null) {
  return Boolean(findPostCreateFocusTrigger(target) || findCreateAnchor(target));
}

function isPlainPrimaryPointer(event: PointerEvent) {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

function isPlainPrimaryClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function markPostCreateComposerFocusIntent() {
  writeFocusIntent();
}

export function primePostCreateComposerFocus() {
  writeFocusIntent();
  if (!isMobileKeyboardEnvironment()) return false;

  if (bridgeReleaseTimer !== null) {
    window.clearTimeout(bridgeReleaseTimer);
    bridgeReleaseTimer = null;
  }

  const bridge = getFocusBridgeTextarea();
  bridge.value = '';
  focusElement(bridge);

  try {
    (navigator as any).virtualKeyboard?.show?.();
  } catch {
    // VirtualKeyboard is Chromium-only and best-effort.
  }

  return document.activeElement === bridge;
}

export function installPostCreateFocusIntentCapture(root?: Document): (() => void) | undefined {
  if (!canUseDocument()) return;
  const targetRoot = root || document;

  const primeFromPointer = (event: PointerEvent) => {
    if (!isPlainPrimaryPointer(event)) return;
    if (!shouldPrimeForTarget(event.target)) return;
    primePostCreateComposerFocus();
  };

  const primeFromClick = (event: MouseEvent) => {
    if (!isPlainPrimaryClick(event)) return;
    if (!shouldPrimeForTarget(event.target)) return;
    primePostCreateComposerFocus();
  };

  const primeFromKeyboard = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!shouldPrimeForTarget(event.target)) return;
    primePostCreateComposerFocus();
  };

  targetRoot.addEventListener('pointerdown', primeFromPointer, true);
  targetRoot.addEventListener('click', primeFromClick, true);
  targetRoot.addEventListener('keydown', primeFromKeyboard, true);

  return () => {
    targetRoot.removeEventListener('pointerdown', primeFromPointer, true);
    targetRoot.removeEventListener('click', primeFromClick, true);
    targetRoot.removeEventListener('keydown', primeFromKeyboard, true);
  };
}

export function shouldRestorePostCreateComposerFocus() {
  const intentAt = readFocusIntentAt();
  return intentAt > 0 && Date.now() - intentAt <= POST_CREATE_FOCUS_INTENT_TTL_MS;
}

export function clearPostCreateComposerFocusIntent() {
  lastFocusIntentAt = 0;
  if (!canUseDocument()) return;
  try {
    window.sessionStorage.removeItem(POST_CREATE_FOCUS_INTENT_KEY);
  } catch {
    // Ignore blocked storage.
  }
}

export function focusPostCreateComposer(textarea: HTMLTextAreaElement) {
  focusElement(textarea);
  const focused = document.activeElement === textarea;
  if (focused) {
    clearPostCreateComposerFocusIntent();
    bridgeReleaseTimer = window.setTimeout(() => {
      const bridge = document.getElementById(POST_CREATE_FOCUS_BRIDGE_ID);
      if (bridge && document.activeElement !== bridge) bridge.remove();
      bridgeReleaseTimer = null;
    }, POST_CREATE_BRIDGE_RELEASE_MS);
  }
  return focused;
}
