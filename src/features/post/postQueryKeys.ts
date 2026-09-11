import type { CategoryMetaFeedFilters } from '@/types';

export type PostListQueryParams = {
  categoryId?: string;
  userId?: string;
  country?: string;
  query?: string;
  limit?: number;
  location?: string;
  quotedOnly?: boolean;
  categoryMetaScope?: string;
  categoryMetaFilters?: CategoryMetaFeedFilters;
};

export type InfinitePostListQueryParams = Omit<PostListQueryParams, 'limit' | 'quotedOnly'>;

export const postQueryKeys = {
  root: ['posts'] as const,
  list: (params: PostListQueryParams) => ['posts', 'list', params] as const,
  infinite: (params: InfinitePostListQueryParams) => ['posts', 'infinite', params] as const,
};
