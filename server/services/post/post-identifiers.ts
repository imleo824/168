export const POST_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizePostIds(postIds: string[], maxItems: number) {
  return Array.from(
    new Set(
      (postIds || [])
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean),
    ),
  ).slice(0, maxItems);
}
