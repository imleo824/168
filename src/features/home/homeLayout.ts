export function getHomeShellClassName({
  isChromeCollapsed,
}: {
  isMobile: boolean;
  isChromeCollapsed: boolean;
}) {
  const collapsedClassName = isChromeCollapsed ? 'home-chrome-collapsed' : '';

  return ['home-mobile-shell home-document-scroll-shell home-has-sticky-topic-tabs', collapsedClassName]
    .filter(Boolean)
    .join(' ');
}
