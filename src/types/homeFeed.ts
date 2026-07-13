/**
 * Home Feed Type Definitions
 * 统一的类型定义，替代散落的 any 类型
 */

import type { Post } from '@/types';

/**
 * Feed 分页响应
 */
export interface FeedPage<T = Post> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * 首页分类状态
 */
export interface HomeCategoryState {
  selectedHomeCategoryIds: string[];
}

/**
 * 首页 Feed 状态
 */
export interface HomeFeedStateType {
  activeMainTab: 'discover' | 'following';
  discoverTab: string;
  validDiscoverCategoryId: string;
  isTopChromeCollapsed: boolean;
  loadMoreError: boolean;
}

/**
 * Feed 查询结果
 */
export interface FeedQueryResult {
  posts: Post[];
  displayPosts: Post[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  isFetched: boolean;
  isPlaceholderData: boolean;
}

/**
 * 刷新状态
 */
export type RefreshState = 'idle' | 'refreshing' | 'success' | 'error';
export type RefreshUiSource = 'action' | 'tab' | 'pull';

/**
 * 主标签 ID
 */
export type MainTabId = 'discover' | 'following';
