export function normalizeCategoryRef(value: unknown) {
  return String(value || '').trim();
}

export function normalizeCategoryRefKey(value: unknown) {
  return normalizeCategoryRef(value).toLowerCase();
}

export function isSameCategoryRef(left: unknown, right: unknown) {
  const leftKey = normalizeCategoryRefKey(left);
  const rightKey = normalizeCategoryRefKey(right);
  if (!leftKey || !rightKey) return false;
  return leftKey === rightKey;
}
