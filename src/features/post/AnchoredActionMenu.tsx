import React, {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { MoreVertical } from 'lucide-react';

export interface PostOptionsMenuProps {
  postId: string;
  authorId: string;
  authorName: string;
  recommendationEnabled: boolean;
  onOpenStateChange?: (open: boolean) => void;
  ownerOptions?: {
    enabled: boolean;
    isPublished: boolean;
    onTelegramSync?: () => void;
    onPromote?: () => void;
    onStatusChange: () => void;
    onDelete: () => void;
  };
}

function stopCardEvent(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function getFeedMenuAnchorStyle(anchor: HTMLElement | null): CSSProperties | undefined {
  if (!anchor || typeof window === 'undefined') return undefined;
  const rect = anchor.getBoundingClientRect();
  return {
    '--feed-card-options-anchor-x': `${Math.round(rect.left + rect.width / 2)}px`,
    '--feed-card-options-anchor-y': `${Math.round(rect.bottom)}px`,
  } as CSSProperties;
}

const LazyPostOptionsMenuPanel = lazy(() =>
  import('./AnchoredActionMenuPanel').then((module) => ({
    default: module.PostOptionsMenuPanel,
  })),
);

export const PostOptionsMenu = memo(function PostOptionsMenu({
  postId,
  authorId,
  authorName,
  recommendationEnabled,
  onOpenStateChange,
  ownerOptions,
}: PostOptionsMenuProps) {
  const menuInstanceId = useId();
  const optionsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [initialSurfaceStyle, setInitialSurfaceStyle] = useState<CSSProperties | undefined>();
  const ownerOptionsEnabled = Boolean(ownerOptions?.enabled);
  const menuEnabled = ownerOptionsEnabled || recommendationEnabled;

  useEffect(() => {
    onOpenStateChange?.(open);
  }, [onOpenStateChange, open]);

  const handleTriggerClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setInitialSurfaceStyle(getFeedMenuAnchorStyle(optionsTriggerRef.current));
    setOpen((current) => !current);
  }, []);

  if (!menuEnabled || !postId) return null;

  const menuTitle = ownerOptionsEnabled ? '帖子管理' : '内容偏好';
  const menuLabel = ownerOptionsEnabled ? `打开 ${authorName} 的帖子管理` : `打开 ${authorName} 的内容偏好`;
  const surfaceStyle = open ? getFeedMenuAnchorStyle(optionsTriggerRef.current) : undefined;

  return (
    <div
      className="feed-card-options-menu"
      data-card-interactive="true"
      data-no-card-click="true"
    >
      <button
        ref={optionsTriggerRef}
        type="button"
        className="feed-card-more-button pressable"
        aria-label={menuLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-feed-card-options-menu={menuInstanceId}
        data-card-interactive="true"
        data-no-card-click="true"
        onPointerDown={stopCardEvent}
        onClick={handleTriggerClick}
      >
        <MoreVertical aria-hidden="true" />
      </button>
      {open ? (
        <Suspense fallback={null}>
          <LazyPostOptionsMenuPanel
            postId={postId}
            authorId={authorId}
            authorName={authorName}
            recommendationEnabled={recommendationEnabled}
            ownerOptions={ownerOptions}
            open={open}
            menuId={menuInstanceId}
            menuTitle={menuTitle}
            initialSurfaceStyle={initialSurfaceStyle}
            surfaceStyle={surfaceStyle}
            onOpenChange={setOpen}
          />
        </Suspense>
      ) : null}
    </div>
  );
});
