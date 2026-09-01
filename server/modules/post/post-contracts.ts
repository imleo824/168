export type PublicPostDetailQuery = {
  postId: string;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  includeViewRecord?: boolean;
};

export type PublicPostDetailResult<TPost = unknown> = {
  post: TPost | null;
};

export type PublicPostDetailCacheContext = {
  scope: 'post-detail';
  postId: string;
  currentUserId?: string | null;
};

export type PostRoutePerformanceMark = {
  name: string;
  durationMs: number;
  requestId?: string;
  limit?: number;
  postId?: string;
};
