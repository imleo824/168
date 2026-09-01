import {
  POST_CREATE_FOCUS_BRIDGE_ID,
  POST_CREATE_FOCUS_TRIGGER_ATTR,
  canUsePostCreateFocusDocument,
  clearPostCreateBridgeReleaseTimer,
  focusPostCreateTextareaElement,
  writePostCreateFocusIntent,
} from './postCreateFocusCore';

export { POST_CREATE_FOCUS_TRIGGER_ATTR } from './postCreateFocusCore';

function isMobileKeyboardEnvironment() {
  if (!canUsePostCreateFocusDocument()) return false;
  const coarsePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return Boolean(coarsePointer || mobileAgent);
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
  textarea.className = 'ui-post-create-focus-bridge';
  document.body.appendChild(textarea);
  return textarea;
}

function isCreateHref(href: string | null | undefined) {
  if (!href || !canUsePostCreateFocusDocument()) return false;

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
  writePostCreateFocusIntent();
}

export function primePostCreateComposerFocus() {
  writePostCreateFocusIntent();
  if (!isMobileKeyboardEnvironment()) return false;

  clearPostCreateBridgeReleaseTimer();

  const bridge = getFocusBridgeTextarea();
  bridge.value = '';
  focusPostCreateTextareaElement(bridge);

  try {
    (navigator as any).virtualKeyboard?.show?.();
  } catch {
    // VirtualKeyboard is Chromium-only and best-effort.
  }

  return document.activeElement === bridge;
}

export function installPostCreateFocusIntentCapture(root?: Document): (() => void) | undefined {
  if (!canUsePostCreateFocusDocument()) return undefined;
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
