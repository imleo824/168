import { useLayoutEffect } from 'react';

const MOBILE_WIDTH = 1024;
const VISUAL_VIEWPORT_SCROLL_NOISE_PX = 4;
const LEGACY_ROOT_SCROLL_CLASS_NAMES = [
  'post-create-scroll-shell',
  'post-create-keyboard-active',
  'promote-keyboard-active',
];
const TEXT_ENTRY_ACTIVE_CLASS_NAME = 'mobile-text-entry-active';
const CONTAINED_TEXT_ENTRY_SURFACE_SELECTOR = '[data-contained-text-entry-surface="true"]';
let lastEnabled: boolean | null = null;
let lastAppHeight = 0;
let lastLayoutHeight = 0;
let lastLayoutWidth = 0;
let lastVisualHeight = 0;
let lastKeyboardInset = 0;
let hasFocusedTextEntry = false;

function isFormControlElement(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]'),
  );
}

function isContainedTextEntryElement(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(
    target.closest(CONTAINED_TEXT_ENTRY_SURFACE_SELECTOR),
  );
}

function isGlobalFormControlElement(target: EventTarget | null) {
  return isFormControlElement(target) && !isContainedTextEntryElement(target);
}

function clearLegacyRootScrollState() {
  document.documentElement.classList.remove(...LEGACY_ROOT_SCROLL_CLASS_NAMES);
  document.body?.classList.remove(...LEGACY_ROOT_SCROLL_CLASS_NAMES);
}

function isFormControlActive() {
  return isFormControlElement(document.activeElement);
}

function isTextEntryActive() {
  return hasFocusedTextEntry || isFormControlActive();
}

function getVisualHeight() {
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}

function getLayoutHeight() {
  return Math.round(window.innerHeight);
}

function shouldUpdateLayoutHeight(nextLayoutHeight: number) {
  const nextLayoutWidth = Math.round(window.innerWidth);
  const hasLayoutSize = lastLayoutHeight > 0 && lastLayoutWidth > 0;
  const widthChanged = !hasLayoutSize || Math.abs(nextLayoutWidth - lastLayoutWidth) > 1;
  const isMobile = isMobileViewport();

  if (!isMobile || widthChanged) {
    lastLayoutWidth = nextLayoutWidth;
    return true;
  }

  if (!hasLayoutSize) {
    lastLayoutWidth = nextLayoutWidth;
    return true;
  }

  return nextLayoutHeight === lastLayoutHeight;
}

function updateViewportVariables(options: { layout: boolean; visual: boolean; keyboard: boolean }) {
  const layoutHeight = getLayoutHeight();
  const visualHeight = getVisualHeight();
  const stableLayoutHeight = lastLayoutHeight || lastAppHeight || layoutHeight;
  const keyboardLayoutHeight = options.layout ? layoutHeight : stableLayoutHeight;
  const shouldUpdateLayout = options.layout && shouldUpdateLayoutHeight(layoutHeight);

  if (shouldUpdateLayout && layoutHeight !== lastAppHeight) {
    document.documentElement.style.setProperty('--app-vh', `${layoutHeight}px`);
    lastAppHeight = layoutHeight;
  }

  if (shouldUpdateLayout && layoutHeight !== lastLayoutHeight) {
    document.documentElement.style.setProperty('--app-layout-vh', `${layoutHeight}px`);
    lastLayoutHeight = layoutHeight;
  }

  const visualDelta = Math.abs(visualHeight - lastVisualHeight);
  const shouldUpdateVisual = options.visual && (
    lastVisualHeight === 0 ||
    visualDelta > VISUAL_VIEWPORT_SCROLL_NOISE_PX ||
    options.keyboard
  );

  if (shouldUpdateVisual && visualHeight !== lastVisualHeight) {
    document.documentElement.style.setProperty('--app-visual-vh', `${visualHeight}px`);
    lastVisualHeight = visualHeight;
  }

  const keyboardInset = options.keyboard ? Math.max(0, keyboardLayoutHeight - visualHeight) : 0;
  if (keyboardInset !== lastKeyboardInset) {
    document.documentElement.style.setProperty('--app-keyboard-inset', `${keyboardInset}px`);
    lastKeyboardInset = keyboardInset;
  }
}

function isMobileViewport() {
  return (
    window.innerWidth < MOBILE_WIDTH ||
    window.matchMedia('(pointer: coarse)').matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent)
  );
}

function applyMobileAddressBarFlags(enabled = false) {
  if (lastEnabled === enabled) return;
  lastEnabled = enabled;
  document.documentElement.classList.toggle('mobile-addressbar-enabled', enabled);
  document.body.classList.toggle('mobile-addressbar-enabled', enabled);
}

function applyTextEntryFlags(enabled = false) {
  document.documentElement.classList.toggle(TEXT_ENTRY_ACTIVE_CLASS_NAME, enabled);
  document.body?.classList.toggle(TEXT_ENTRY_ACTIVE_CLASS_NAME, enabled);
}

function confirmTextEntryIntent(target: EventTarget | null) {
  if (!isMobileViewport() || !isGlobalFormControlElement(target)) return false;

  hasFocusedTextEntry = true;
  applyTextEntryFlags(true);
  updateViewportVariables({
    layout: false,
    visual: true,
    keyboard: true,
  });
  return true;
}

function runViewportUpdate() {
  clearLegacyRootScrollState();
  const enabled = isMobileViewport();
  applyMobileAddressBarFlags(enabled);

  if (!enabled) {
    hasFocusedTextEntry = false;
    applyTextEntryFlags(false);
    updateViewportVariables({
      layout: true,
      visual: true,
      keyboard: false,
    });
    return;
  }

  const textEntryActive = isTextEntryActive();
  applyTextEntryFlags(textEntryActive);
  updateViewportVariables({
    layout: !textEntryActive,
    visual: true,
    keyboard: textEntryActive,
  });
}

function scheduleLegacyRootCleanup() {
  clearLegacyRootScrollState();
  const frame = window.requestAnimationFrame(clearLegacyRootScrollState);
  const timer = window.setTimeout(clearLegacyRootScrollState, 80);
  return () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
  };
}

export function useMobileAddressBar(resetKey?: unknown) {
  useLayoutEffect(() => {
    let frame: number | null = null;
    let blurTimer: number | null = null;
    let textEntryIntentTimer: number | null = null;
    let cleanupLegacyRoot = scheduleLegacyRootCleanup();

    const scheduleRun = (force = false) => {
      if (force) {
        if (frame !== null) {
          window.cancelAnimationFrame(frame);
          frame = null;
        }
        runViewportUpdate();
        return;
      }

      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        runViewportUpdate();
      });
    };

    const schedulePostTextEntryRun = () => {
      hasFocusedTextEntry = false;
      cleanupLegacyRoot();
      cleanupLegacyRoot = scheduleLegacyRootCleanup();
      if (blurTimer !== null) window.clearTimeout(blurTimer);
      window.requestAnimationFrame(() => scheduleRun(true));
      blurTimer = window.setTimeout(() => {
        blurTimer = null;
        scheduleRun(true);
      }, 360);
    };

    const clearTextEntryIntentTimer = () => {
      if (textEntryIntentTimer === null) return;
      window.clearTimeout(textEntryIntentTimer);
      textEntryIntentTimer = null;
    };

    const scheduleTextEntryIntentSelfHeal = () => {
      clearTextEntryIntentTimer();
      textEntryIntentTimer = window.setTimeout(() => {
        textEntryIntentTimer = null;
        if (isFormControlActive()) return;
        hasFocusedTextEntry = false;
        scheduleRun(true);
      }, 520);
    };

    const handleViewportChange = () => scheduleRun(false);
    const handlePageShow = () => scheduleRun(true);
    const handleWindowFocus = () => scheduleRun(false);
    const handleTextEntryPointerDown = (event: PointerEvent | TouchEvent) => {
      const isContainedEntry = isContainedTextEntryElement(event.target);
      const isGlobalEntry = isGlobalFormControlElement(event.target);
      if (!isContainedEntry && !isGlobalEntry) return;
      if (isGlobalEntry && confirmTextEntryIntent(event.target)) {
        scheduleTextEntryIntentSelfHeal();
        return;
      }
      scheduleRun(false);
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (isContainedTextEntryElement(event.target)) {
        scheduleRun(false);
        return;
      }
      if (!isFormControlElement(event.target)) return;
      confirmTextEntryIntent(event.target);
      scheduleRun(false);
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (isContainedTextEntryElement(event.target)) {
        schedulePostTextEntryRun();
        return;
      }
      if (!isFormControlElement(event.target)) return;
      schedulePostTextEntryRun();
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) scheduleRun(true);
    };

    runViewportUpdate();

    window.visualViewport?.addEventListener('resize', handleViewportChange, { passive: true });
    window.addEventListener('resize', handleViewportChange, { passive: true });
    window.addEventListener('orientationchange', handlePageShow, { passive: true });
    window.addEventListener('focus', handleWindowFocus, { passive: true });
    window.addEventListener('pageshow', handlePageShow, { passive: true });
    document.addEventListener('pointerdown', handleTextEntryPointerDown, { passive: true, capture: true });
    document.addEventListener('touchstart', handleTextEntryPointerDown, { passive: true, capture: true });
    document.addEventListener('focusin', handleFocusIn, { passive: true });
    document.addEventListener('focusout', handleFocusOut, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

    return () => {
      cleanupLegacyRoot();
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
      }
      clearTextEntryIntentTimer();
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handlePageShow);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('pointerdown', handleTextEntryPointerDown, { capture: true } as AddEventListenerOptions);
      document.removeEventListener('touchstart', handleTextEntryPointerDown, { capture: true } as AddEventListenerOptions);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      document.documentElement.style.removeProperty('--app-vh');
      document.documentElement.style.removeProperty('--app-layout-vh');
      document.documentElement.style.removeProperty('--app-visual-vh');
      document.documentElement.style.removeProperty('--app-keyboard-inset');
      document.documentElement.classList.remove('mobile-addressbar-enabled');
      document.body.classList.remove('mobile-addressbar-enabled');
      document.documentElement.classList.remove(TEXT_ENTRY_ACTIVE_CLASS_NAME);
      document.body.classList.remove(TEXT_ENTRY_ACTIVE_CLASS_NAME);
      clearLegacyRootScrollState();
      hasFocusedTextEntry = false;
      lastEnabled = null;
      lastAppHeight = 0;
      lastLayoutHeight = 0;
      lastLayoutWidth = 0;
      lastVisualHeight = 0;
      lastKeyboardInset = 0;
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;
    runViewportUpdate();
    return scheduleLegacyRootCleanup();
  }, [resetKey]);
}
