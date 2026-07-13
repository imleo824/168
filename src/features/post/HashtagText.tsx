import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface HashtagTextProps {
  text: string;
  className?: string;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/gi;
const HASHTAG_PATTERN = /#[\p{L}\p{N}_\-·.]{1,80}/gu;

function trimTrailingPunctuation(url: string) {
  const match = url.match(/[）)\]】,，.。!！?？]+$/);
  if (!match) return { href: url, trailing: '' };
  const trailing = match[0];
  return { href: url.slice(0, -trailing.length), trailing };
}

function normalizeHashtagLabel(raw: string) {
  return raw.replace(/^#+/, '').trim();
}

function renderTextWithHashtags(text: string, partKey: string) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  HASHTAG_PATTERN.lastIndex = 0;

  while ((match = HASHTAG_PATTERN.exec(text)) !== null) {
    const rawTag = match[0];
    const tag = normalizeHashtagLabel(rawTag);
    if (!tag) continue;
    if (match.index > lastIndex) {
      nodes.push(<span key={`${partKey}-text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    const params = new URLSearchParams({ view: 'tag', tag });
    nodes.push(
      <Link
        key={`${partKey}-tag-${match.index}-${tag}`}
        to={`/category/search?${params.toString()}`}
        state={{ name: tag, resultType: 'tag' }}
        className="x-card-content-hashtag"
        data-card-interactive="true"
        data-no-card-click="true"
        onClick={(event) => event.stopPropagation()}
      >
        {rawTag}
      </Link>,
    );
    lastIndex = match.index + rawTag.length;
  }

  if (lastIndex < text.length) {
    nodes.push(<span key={`${partKey}-text-tail`}>{text.slice(lastIndex)}</span>);
  }

  return nodes.length > 0 ? nodes : text;
}

export function HashtagText({ text, className = '' }: HashtagTextProps) {
  if (!text) return null;

  const parts = text.split(URL_PATTERN);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!/^https?:\/\//i.test(part)) return <span key={`text-${index}`}>{renderTextWithHashtags(part, `part-${index}`)}</span>;
        const { href, trailing } = trimTrailingPunctuation(part);
        return (
          <span key={`url-${index}`}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              data-card-interactive="true"
              data-no-card-click="true"
              onClick={(event) => event.stopPropagation()}
            >
              {href}
            </a>
            {trailing}
          </span>
        );
      })}
    </span>
  );
}
