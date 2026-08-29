import { Fragment, type ReactNode } from 'react';

import ActionButton from '@/ui/ActionButton';
import BottomSheet from '@/ui/BottomSheet';
import { Skeleton } from '@/ui/Skeleton';

export default function PromotePostPickerSheet({
  open,
  onClose,
  isLoadingPromotablePosts,
  orderedPromotablePosts,
  renderPromotablePostCard,
  onCreatePost,
}: {
  open: boolean;
  onClose: () => void;
  isLoadingPromotablePosts: boolean;
  orderedPromotablePosts: any[];
  renderPromotablePostCard: (post: any, options?: { closeOnSelect?: boolean }) => ReactNode;
  onCreatePost: () => void;
}) {
  if (!open) return null;

  return (
    <BottomSheet
      open={open}
      title="选择要曝光的推"
      ariaLabel="选择要曝光的推"
      onClose={onClose}
      panelClassName="ui-sheet-panel promote-picker-sheet"
      bodyClassName="promote-picker-body"
    >
      <div
        data-promote-sheet-scroll
        className="promote-picker-scroll"
      >
        {isLoadingPromotablePosts ? (
          <div className="promote-picker-list">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="promote-picker-skeleton-card">
                <Skeleton className="promote-picker-skeleton-media" />
                <Skeleton className="promote-picker-skeleton-title" />
              </div>
            ))}
          </div>
        ) : orderedPromotablePosts.length > 0 ? (
          <div className="promote-picker-list">
            {orderedPromotablePosts.map((post: any) => (
              <Fragment key={post.id}>
                {renderPromotablePostCard(post, { closeOnSelect: true })}
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="promote-picker-empty">
            <div className="promote-picker-empty-copy-group">
              <p className="promote-picker-empty-title">暂无可曝光的推</p>
              <p className="promote-picker-empty-copy">发一条推后，就可以回来推广。</p>
            </div>
            <ActionButton
              type="button"
              variant="brand"
              size="sm"
              onClick={onCreatePost}
              className="promote-picker-empty-action"
              aria-label="去发推"
            >
              去发推
            </ActionButton>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
