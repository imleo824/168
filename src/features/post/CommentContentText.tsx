import type { ReactNode } from 'react';

const COMMENT_LINK_PATTERN = /((?:https?:\/\/|www\.|(?:t\.me|telegram\.me)\/|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|co|cn|cc|me|tv|app|xyz|info|biz|site|online|shop|vip|top|live|link|world|asia|dev|ai)(?:\/[\S]*)?)[^\s<>()]*)/gi;
const COMMENT_TRAILING_PUNCTUATION_PATTERN = /[.,!?;:，。！？；：、)\]】》>]+$/;

function splitCommentLinkTrailingPunctuation(value: string) {
  let linkText = value;
  let trailingText = '';
  while (COMMENT_TRAILING_PUNCTUATION_PATTERN.test(linkText)) {
    trailingText = linkText.slice(-1) + trailingText;
    linkText = linkText.slice(0, -1);
  }
  return { linkText, trailingText };
}

function toSafeCommentLinkHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function renderCommentContentLinks(content: string): ReactNode[] {
  if (!content) return [''];
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  Array.from(content.matchAll(COMMENT_LINK_PATTERN)).forEach((match, index) => {
    const rawMatch = match[0] || '';
    const matchIndex = typeof match.index === 'number' ? match.index : -1;
    if (!rawMatch || matchIndex < lastIndex) return;
    const previousChar = matchIndex > 0 ? content[matchIndex - 1] : '';
    if (previousChar === '@') return;

    if (matchIndex > lastIndex) nodes.push(content.slice(lastIndex, matchIndex));

    const { linkText, trailingText } = splitCommentLinkTrailingPunctuation(rawMatch);
    const href = toSafeCommentLinkHref(linkText);
    if (href) {
      nodes.push(
        <a
          key={`comment-link-${matchIndex}-${index}`}
          href={href}
          className="post-comment-content-link"
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {linkText}
        </a>,
      );
    } else {
      nodes.push(linkText);
    }
    if (trailingText) nodes.push(trailingText);
    lastIndex = matchIndex + rawMatch.length;
  });

  if (lastIndex < content.length) nodes.push(content.slice(lastIndex));
  return nodes.length ? nodes : [content];
}

export function CommentContentText({ content }: { content: string }) {
  return <>{renderCommentContentLinks(content)}</>;
}
