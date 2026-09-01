export function collapseText(text: string | null | undefined, maxLength: number) {
  const collapsed = (text || '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}...` : collapsed;
}
