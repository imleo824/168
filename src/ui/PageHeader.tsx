import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopbarIconButton from '@/ui/TopbarIconButton';
import { UI_BACK_NAVIGATION_FALLBACK_MS, UI_BACK_NAVIGATION_LOCK_MS } from '@/ui/interactionTokens';
import { usePageHeaderPolicy } from '@/ui/PageHeaderPolicy';

export type PageHeaderVariant = 'standard' | 'home' | 'detail' | 'transparent';
export type PageHeaderTitleAlign = 'start' | 'center';
export type PageHeaderTopbarMode = 'sticky' | 'static';

interface PageHeaderProps {
  title: string;
  titleAs?: 'h1' | 'div';
  left?: ReactNode;
  titleNode?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  showBack?: boolean;
  isTitleLoading?: boolean;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  leftClassName?: string;
  rightClassName?: string;
  variant?: PageHeaderVariant;
  titleAlign?: PageHeaderTitleAlign;
  topbarMode?: PageHeaderTopbarMode;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function getVariantClassName(variant: PageHeaderVariant) {
  switch (variant) {
    case 'home':
      return 'ui-topbar--home';
    case 'detail':
      return 'ui-topbar--detail';
    case 'transparent':
      return 'ui-topbar--transparent';
    default:
      return 'ui-topbar--standard';
  }
}

const PAGE_HEADER_TITLE_ALIASES: Record<string, string> = {
  推广内容: '付费推广',
};

function resolvePageHeaderTitle(title: string) {
  const text = title.trim();
  return PAGE_HEADER_TITLE_ALIASES[text] || text;
}

export default function PageHeader({
  title,
  titleAs = 'h1',
  left,
  titleNode,
  right,
  onBack,
  showBack = true,
  isTitleLoading = false,
  className = '',
  contentClassName = '',
  titleClassName = '',
  leftClassName = '',
  rightClassName = '',
  variant = 'standard',
  titleAlign,
  topbarMode,
}: PageHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const policy = usePageHeaderPolicy();
  const backLockRef = useRef(false);
  const backFallbackTimerRef = useRef<number | null>(null);
  const backLockTimerRef = useRef<number | null>(null);
  const resolvedShowBack = policy?.forceShowBack ?? showBack;
  const resolvedOnBack = policy?.onBack ?? onBack;
  const resolvedVariant = policy?.variant ?? variant;
  const resolvedTopbarMode = policy?.topbarMode ?? topbarMode;
  const resolvedRight = policy?.right ?? right;
  const resolvedTitleAlign = titleAlign ?? (resolvedVariant === 'home' ? 'center' : 'start');
  const innerLayoutClass = resolvedTitleAlign === 'center'
    ? 'ui-topbar-inner--center-title'
    : 'ui-topbar-inner--start-title';
  const titleAlignmentClass = resolvedTitleAlign === 'center'
    ? 'ui-topbar-title--center'
    : 'ui-topbar-title--start';
  const titleText = resolvePageHeaderTitle(title);
  const shouldShowLeadingPlaceholder = !left && !resolvedShowBack && resolvedTitleAlign === 'center';
  const shouldShowTrailingPlaceholder = !resolvedRight && resolvedTitleAlign === 'center';

  const releaseBackLock = useCallback(() => {
    if (backLockTimerRef.current) {
      window.clearTimeout(backLockTimerRef.current);
    }
    backLockTimerRef.current = window.setTimeout(() => {
      backLockRef.current = false;
      backLockTimerRef.current = null;
    }, UI_BACK_NAVIGATION_LOCK_MS);
  }, []);

  const handleBack = useCallback(() => {
    if (backLockRef.current) return;
    backLockRef.current = true;

    if (resolvedOnBack) {
      resolvedOnBack();
      releaseBackLock();
      return;
    }

    const historyIdx = typeof window.history.state?.idx === 'number' ? window.history.state.idx : -1;
    if (historyIdx > 0) {
      const currentHref = `${location.pathname}${location.search}${location.hash}`;
      navigate(-1);
      if (backFallbackTimerRef.current) {
        window.clearTimeout(backFallbackTimerRef.current);
      }
      backFallbackTimerRef.current = window.setTimeout(() => {
        const nextHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (nextHref === currentHref) {
          navigate('/', { replace: true });
        }
        backFallbackTimerRef.current = null;
      }, UI_BACK_NAVIGATION_FALLBACK_MS);
      releaseBackLock();
      return;
    }

    navigate('/', { replace: true });
    releaseBackLock();
  }, [location.hash, location.pathname, location.search, navigate, releaseBackLock, resolvedOnBack]);

  useEffect(() => () => {
    if (backFallbackTimerRef.current) {
      window.clearTimeout(backFallbackTimerRef.current);
    }
    if (backLockTimerRef.current) {
      window.clearTimeout(backLockTimerRef.current);
    }
  }, []);

  const renderedTitle = useMemo(() => {
    if (titleNode) return titleNode;
    if (isTitleLoading) return <span className="ui-title-skeleton" aria-label="正在加载标题" />;
    return titleText;
  }, [isTitleLoading, titleNode, titleText]);
  const TitleElement = titleAs;
  const renderedLeading = left ?? (resolvedShowBack ? (
    <TopbarIconButton
      onClick={handleBack}
      ariaLabel="返回"
      tone="strong"
      action="back"
    />
  ) : shouldShowLeadingPlaceholder ? (
    <span className="ui-topbar-leading-placeholder" aria-hidden="true" />
  ) : null);
  const renderedTrailing = resolvedRight ?? (shouldShowTrailingPlaceholder ? (
    <span className="ui-topbar-action-placeholder" aria-hidden="true" />
  ) : null);
  const hasLeadingContent = renderedLeading !== null && renderedLeading !== false;
  const hasTrailingContent = renderedTrailing !== null && renderedTrailing !== false;
  const leadingKind = left ? 'custom' : resolvedShowBack ? 'default-back' : shouldShowLeadingPlaceholder ? 'placeholder' : 'none';
  const actionKind = resolvedRight ? 'custom' : shouldShowTrailingPlaceholder ? 'placeholder' : 'none';

  return (
    <div
      className={cx('nav-blur ui-topbar', getVariantClassName(resolvedVariant), className)}
      data-topbar-variant={resolvedVariant}
      data-ui-topbar-mode={resolvedTopbarMode || undefined}
      data-title-align={resolvedTitleAlign}
      data-has-leading={hasLeadingContent ? 'true' : 'false'}
      data-has-action={hasTrailingContent ? 'true' : 'false'}
      data-leading-kind={leadingKind}
      data-action-kind={actionKind}
    >
      <div className="ui-topbar-shell">
        <div className={cx('ui-topbar-inner', innerLayoutClass, contentClassName)}>
          <div className={cx('ui-topbar-leading-slot', leftClassName)}>
            {hasLeadingContent ? (
              <span className="ui-topbar-slot-item">
                {renderedLeading}
              </span>
            ) : null}
          </div>

          <TitleElement
            className={cx('ui-topbar-title', titleAlignmentClass, 'ui-text-strong', titleClassName)}
            title={titleText || undefined}
            aria-busy={isTitleLoading || undefined}
          >
            {renderedTitle}
          </TitleElement>

          <div className={cx('ui-topbar-action-slot', rightClassName)}>
            {hasTrailingContent ? (
              <span className="ui-topbar-slot-item">
                {renderedTrailing}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
