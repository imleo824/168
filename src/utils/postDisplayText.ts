const PLACEHOLDER_POST_TITLES = new Set([
  '无标题记录',
  '无标题内容',
  '图片动态',
  '无内容',
]);

export function normalizePostTitleText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizePostContentText(value: unknown): string {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

export function isPlaceholderPostTitle(value: unknown): boolean {
  return PLACEHOLDER_POST_TITLES.has(normalizePostTitleText(value));
}

export function resolveVisiblePostText(post: { content?: unknown; title?: unknown } | null | undefined): string {
  const content = normalizePostContentText(post?.content);
  if (content && !isPlaceholderPostTitle(content)) return content;

  const title = normalizePostTitleText(post?.title);
  return isPlaceholderPostTitle(title) ? '' : title;
}
