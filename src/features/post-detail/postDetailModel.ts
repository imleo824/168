import type { Post } from '@/types';
import { normalizeImageList } from '@/utils/media';
import { stripInlineHashtags } from '@/utils/postPresentation';
import {
  isPlaceholderPostTitle,
  normalizePostContentText,
} from '@/utils/postDisplayText';

export type PostDetailContentKind =
  | 'empty'
  | 'text-only'
  | 'media-only'
  | 'text-media'
  | 'quote-only'
  | 'metadata-only';

export interface PostDetailContentShape {
  hasText: boolean;
  hasMedia: boolean;
  hasQuotePreview: boolean;
  hasMetadata: boolean;
}

export interface PostDetailContentModel extends PostDetailContentShape {
  titleText: string;
  contentText: string;
  images: string[];
  quoteCount: number;
}

export function resolvePostDetailContentKind({
  hasText,
  hasMedia,
  hasQuotePreview,
  hasMetadata,
}: PostDetailContentShape): PostDetailContentKind {
  if (hasText && hasMedia) return 'text-media';
  if (hasText) return 'text-only';
  if (hasMedia) return 'media-only';
  if (hasQuotePreview) return 'quote-only';
  if (hasMetadata) return 'metadata-only';
  return 'empty';
}

export function buildPostDetailContentModel(post: Post | null | undefined): PostDetailContentModel {
  const rawTitleText = stripInlineHashtags(post?.title || '').trim();
  const titleText = isPlaceholderPostTitle(rawTitleText) ? '' : rawTitleText;
  const rawContentText = normalizePostContentText(post?.content);
  const contentText = isPlaceholderPostTitle(rawContentText) ? '' : rawContentText;
  const images = normalizeImageList(post?.images);
  const quotedPost = post?.quotedPost;

  return {
    titleText,
    contentText,
    images,
    quoteCount: Math.max(0, Number(post?.quoteCount || 0)),
    hasText: Boolean(contentText),
    hasMedia: images.length > 0,
    hasQuotePreview: Boolean(quotedPost),
    hasMetadata: false,
  };
}
