export const TEXT_ENTRY_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

export function isTextEntryTarget(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && target.matches(TEXT_ENTRY_SELECTOR);
}

export function getActiveTextEntry(scope?: Node | null) {
  if (typeof document === 'undefined') return null;

  const active = document.activeElement;
  if (!isTextEntryTarget(active)) return null;
  if (scope && !scope.contains(active)) return null;

  return active;
}

export function releaseActiveTextEntry(scope?: Node | null) {
  const active = getActiveTextEntry(scope);
  if (!active) return false;

  active.blur();
  return true;
}
