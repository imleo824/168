import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const ENTRY_FILES = [join(ROOT, 'index.html')];

const EXCLUDED_FILES = new Set([
  'src/pages/Admin.tsx',
  'src/features/admin/AdminChatPanel.tsx',
  'src/features/admin/AdminFiltersPanel.tsx',
  'src/features/admin/AdminPage.tsx',
  'src/features/admin/AdminPaginationBar.tsx',
  'src/features/admin/AdminTableHeader.tsx',
  'src/features/admin/SystemConfigHeader.tsx',
  'src/features/admin/adminMeta.tsx',
  'src/pages/Home.backup.tsx',
  'src/styles/00-tokens.css',
  'src/styles/features/admin.css',
]);

const EXCLUDED_PREFIXES = [
  'src/styles/00-',
  'src/pages/Admin',
  'src/features/admin/AdminPage',
  'src/pages/Home.backup',
  'src/styles/tokens/',
];

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git']);

const FILE_EXTENSIONS = new Set(['.tsx', '.ts', '.css', '.html']);

const TOKEN_VALUE_RE = /#[0-9a-fA-F]{3,8}|rgba?\(/;
const ARBITRARY_TAILWIND_RE = /\b(?:z|text|bg|shadow|tracking|leading|top|bottom|left|right|h|w|min-h|min-w|max-h|max-w|rounded)-\[([^\]]+)\]/g;
const TAILWIND_PALETTE_RE = /\b(?:bg|text|border|ring|from|via|to|placeholder):?-(?:white|black|gray|slate|zinc|neutral|stone|red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink)(?:-\d{2,3})?(?:\/(?:\d{1,3}|\[[^\]]+\]))?/;
const TAILWIND_SHADOW_RE = /\bshadow-(?:sm|md|lg|xl|2xl|inner|\[[^\]]+\])\b/;
const CSS_RAW_RESET_RE = /^\s*(?:(?:background|background-color|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|color|-webkit-tap-highlight-color):\s*transparent|text-decoration:\s*none|outline:\s*(?:none|0)|border:\s*0|padding:\s*0|margin:\s*0|gap:\s*0|border-radius:\s*0|(?:box-shadow|filter|backdrop-filter|-webkit-backdrop-filter|background-image|max-width|max-height|max-block-size):\s*none)\s*;/;
const CSS_RAW_Z_INDEX_RE = /^\s*z-index:\s*-?\d+\s*;/;
const CSS_RAW_OPACITY_RE = /^\s*opacity:\s*(?:0|1|0?\.\d+|\.\d+)\s*;/;
const CSS_RAW_COLOR_MIX_RE = /^\s*(?!--)[a-z-]+(?:-[a-z-]+)*\s*:\s*[^;]*color-mix\(/;
const CSS_VIEWPORT_FONT_SIZE_RE = /^\s*(?:font-size|--[a-zA-Z0-9-_]*(?:font|type|text|title|label|copy|display)[a-zA-Z0-9-_]*size)\s*:\s*[^;]*(?:vw|vh|dvw|dvh|svw|svh|lvw|lvh)/;
const CSS_NONZERO_TRACKING_TOKEN_RE = /^\s*--[a-zA-Z0-9-_]*(?:tracking|letter-spacing)[a-zA-Z0-9-_]*\s*:(?!\s*(?:0|var\(--ui-tracking-normal\))\s*;)/;
const CSS_RAW_NONZERO_LETTER_SPACING_RE = /^\s*letter-spacing:(?!\s*(?:0|inherit|var\(--ui-tracking-(?:normal|tight|wide|compact)\)|var\(--ui-letter-spacing-wide\)|var\(--ui-home-topbar-brand-tracking\)|var\(--ui-home-topbar-brand-desktop-tracking\)|var\(--ui-topbar-title-tracking\)|var\(--ui-post-tag-letter-spacing\)|var\(--x-card-readable-letter-spacing\)|var\(--ui-brand-about-title-tracking\)|var\(--ui-post-create-submit-label-tracking\))\s*;)/;
const CSS_COMPONENT_GLOBAL_LAYER_RE = /^\s*@layer\s+base\b/;
const CSS_COMPONENT_ROOT_SELECTOR_RE = /^\s*:root\b/;
const CSS_FEATURE_ROOT_TOKEN_SELECTOR_RE = /^\s*:root\s*\{/;
const RESPONSIVE_BREAKPOINTS_PX = new Set([
  '360',
  '380',
  '390',
  '430',
  '480',
  '560',
  '639',
  '640',
  '767',
  '768',
  '1023',
  '1024',
  '1179',
  '1180',
  '1200',
]);

const ALLOWED_LINE_PATTERNS = [
  /url\("data:image\/svg\+xml/,
  /theme-color/,
  /TileColor/,
  /fillStyle = '#ffffff'/,
];

const ALLOWED_RAW_CSS_LINES = new Set([
  'src/styles/features/home-floating-ads.css|background: transparent;',
  'src/styles/features/home-floating-ads.css|box-shadow: none;',
  'src/styles/features/home-topic-tabs-shell.css|padding: 0;',
  'src/styles/features/profile-shared-bio.css|max-width: none;',
  'src/styles/features/profile-shared-header.css|max-width: none;',
  'src/styles/features/sponsor.css|gap: 0;',
  'src/styles/system/ui-primitives-interactions.css|box-shadow: none;',
]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const absolute = join(dir, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      walk(absolute, files);
      continue;
    }
    files.push(absolute);
  }
  return files;
}

function extname(file) {
  const index = file.lastIndexOf('.');
  return index >= 0 ? file.slice(index) : '';
}

function isAllowed(line) {
  return ALLOWED_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

function hasHardcodedArbitraryTailwind(line) {
  ARBITRARY_TAILWIND_RE.lastIndex = 0;
  for (const match of line.matchAll(ARBITRARY_TAILWIND_RE)) {
    const value = match[1] || '';
    if (/var\(|env\(|calc\(|%|dvh|svh|lvh|vh|dvw|svw|lvw|vw|rem|em/.test(value)) continue;
    return true;
  }
  return false;
}

function isExcluded(rel) {
  return EXCLUDED_FILES.has(rel) || EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

function readRel(rel) {
  if (!existsSync(join(ROOT, rel))) return '';
  return readFileSync(join(ROOT, rel), 'utf8');
}

function assertIncludes(rel, expected, message) {
  if (!readRel(rel).includes(expected)) {
    violations.push(`${rel}: ${message}`);
  }
}

function assertNotIncludes(rel, unexpected, message) {
  if (readRel(rel).includes(unexpected)) {
    violations.push(`${rel}: ${message}`);
  }
}

function assertMatches(rel, pattern, message) {
  if (!pattern.test(readRel(rel))) {
    violations.push(`${rel}: ${message}`);
  }
}

function assertCssRuleIncludes(rel, selector, expectedDeclarations, message) {
  const source = readRel(rel).replace(/\/\*[\s\S]*?\*\//g, '');
  const selectorIndex = source.indexOf(selector);
  if (selectorIndex === -1) {
    violations.push(`${rel}: ${message}`);
    return;
  }

  const blockStart = source.indexOf('{', selectorIndex);
  if (blockStart === -1) {
    violations.push(`${rel}: ${message}`);
    return;
  }

  let depth = 0;
  let blockEnd = -1;
  for (let index = blockStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        blockEnd = index;
        break;
      }
    }
  }

  if (blockEnd === -1) {
    violations.push(`${rel}: ${message}`);
    return;
  }

  const rule = source.slice(blockStart + 1, blockEnd);
  const missing = expectedDeclarations.filter((declaration) => !rule.includes(declaration));
  if (missing.length > 0) {
    violations.push(`${rel}: ${message}`);
  }
}

const violations = [];
const hardcodingDebt = [];

function reportHardcodingDebt(message) {
  hardcodingDebt.push(message);
}

const definedVars = new Set();
const usedVars = new Set();
const sourceFiles = [
  ...ENTRY_FILES,
  ...walk(SRC).filter((file) => FILE_EXTENSIONS.has(extname(file))),
];

for (const file of sourceFiles) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    for (const match of line.matchAll(/(--[a-zA-Z0-9-_]+)\s*:/g)) {
      definedVars.add(match[1]);
    }
    for (const match of line.matchAll(/var\((--[a-zA-Z0-9-_]+)/g)) {
      usedVars.add(match[1]);
    }
  });
}

for (const file of sourceFiles) {
  const rel = relative(ROOT, file);

  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isAllowed(line)) return;
    if (rel.endsWith('.css') && CSS_VIEWPORT_FONT_SIZE_RE.test(line)) {
      reportHardcodingDebt(`${rel}:${index + 1}: font sizing must use semantic type tokens, not viewport-relative formulas.`);
    }
    if (rel.endsWith('.css') && CSS_NONZERO_TRACKING_TOKEN_RE.test(line)) {
      reportHardcodingDebt(`${rel}:${index + 1}: letter-spacing tokens must resolve to the zero tracking contract.`);
    }
    if (rel.endsWith('.css') && CSS_RAW_NONZERO_LETTER_SPACING_RE.test(line)) {
      reportHardcodingDebt(`${rel}:${index + 1}: letter-spacing declarations must use the zero tracking contract.`);
    }

    if (isExcluded(rel)) return;
    if (
      TOKEN_VALUE_RE.test(line) ||
      hasHardcodedArbitraryTailwind(line) ||
      TAILWIND_PALETTE_RE.test(line) ||
      TAILWIND_SHADOW_RE.test(line)
    ) {
      reportHardcodingDebt(`${rel}:${index + 1}: ${line.trim()}`);
    }
    if (!rel.endsWith('.css')) return;
    if (rel.startsWith('src/styles/components/') && CSS_COMPONENT_GLOBAL_LAYER_RE.test(line)) {
      reportHardcodingDebt(`${rel}:${index + 1}: component CSS must not declare global token layers; move shared tokens to src/styles/tokens or src/styles/system contracts.`);
    }
    if (rel.startsWith('src/styles/components/') && CSS_COMPONENT_ROOT_SELECTOR_RE.test(line)) {
      reportHardcodingDebt(`${rel}:${index + 1}: component CSS must not declare :root tokens; move shared tokens to src/styles/tokens or src/styles/system contracts.`);
    }
    if (rel.startsWith('src/styles/features/') && CSS_COMPONENT_GLOBAL_LAYER_RE.test(line)) {
      reportHardcodingDebt(`${rel}:${index + 1}: feature CSS must not declare global token layers; move feature tokens to src/styles/tokens/feature-contracts.css.`);
    }
    if (rel.startsWith('src/styles/features/') && CSS_FEATURE_ROOT_TOKEN_SELECTOR_RE.test(line)) {
      reportHardcodingDebt(`${rel}:${index + 1}: feature CSS must not declare :root token sources; move feature tokens to src/styles/tokens/feature-contracts.css.`);
    }
    if (index === 0 && rel.startsWith('src/styles/features/') && /(?:^|\/)[a-z0-9-]*tokens?\.css$/.test(rel)) {
      reportHardcodingDebt(`${rel}:${index + 1}: feature token files must not live in src/styles/features; register tokens in src/styles/tokens/feature-contracts.css.`);
    }
    const normalizedLine = line.trim();
    const isAllowedRawCssLine = ALLOWED_RAW_CSS_LINES.has(`${rel}|${normalizedLine}`);

    if (!isAllowedRawCssLine && CSS_RAW_RESET_RE.test(line)) {
      reportHardcodingDebt(`${rel}:${index + 1}: reset declarations must consume ui reset tokens.`);
    }
    if (CSS_RAW_Z_INDEX_RE.test(line)) {
      reportHardcodingDebt(`${rel}:${index + 1}: z-index declarations must consume semantic layer tokens.`);
    }
    if (CSS_RAW_OPACITY_RE.test(line)) {
      reportHardcodingDebt(`${rel}:${index + 1}: opacity declarations must consume semantic opacity tokens.`);
    }
    if (CSS_RAW_COLOR_MIX_RE.test(line)) {
      reportHardcodingDebt(`${rel}:${index + 1}: color-mix declarations must be promoted to semantic tokens.`);
    }
  });
}

for (const cssVar of [...usedVars].sort()) {
  if (definedVars.has(cssVar) || cssVar.startsWith('--tw-')) continue;
  reportHardcodingDebt(`undefined-css-var: ${cssVar}`);
}

for (const file of sourceFiles) {
  const rel = relative(ROOT, file);
  if (!rel.endsWith('.css')) continue;

  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.includes('@media')) return;
    for (const match of line.matchAll(/\b(?:min|max)-width:\s*(\d+)px\b/g)) {
      if (RESPONSIVE_BREAKPOINTS_PX.has(match[1])) continue;
      reportHardcodingDebt(`${rel}:${index + 1}: unregistered responsive breakpoint ${match[1]}px`);
    }
  });
}

assertIncludes('src/styles/00-product-tokens.css', '--ui-product-brand: #4F5FD9;', 'product brand must use the muted blue-violet primary.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-product-brand-tint: #EEF0FC;', 'product brand tint must be the shared selected/tag surface.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-product-brand-shade: #2B3380;', 'product brand shade must be the shared link/tag emphasis text.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-product-canvas: #F8F8F7;', 'product canvas must use the warm near-white page background.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-product-ink: #1A1A1A;', 'product ink must avoid pure black for body and titles.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-product-glass-white-70: rgba(255, 255, 255, 0.7);', 'product card glass must use the shared 70% white surface.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-product-glass-filter: blur(20px);', 'product card glass must use the shared 20px blur.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-link-text: var(--ui-product-brand-shade);', 'links must use the deep brand shade instead of default blue.');
assertIncludes('index.html', '--initial-surface-page: var(--ui-surface-page, Canvas);', 'initial page background must defer to the product surface token.');
assertIncludes('index.html', '--initial-online-dot: var(--ui-online-dot, color-mix(in srgb, CanvasText 68%, Canvas));', 'initial online dot must defer to the shared online token.');
assertIncludes('index.html', 'class="initial-home-topbar home-topbar ui-topbar ui-topbar--home"', 'initial home skeleton must use the shared home topbar semantic contract.');
assertIncludes('index.html', 'class="initial-home-topbar-inner ui-topbar-inner ui-topbar-inner--center-title"', 'initial home skeleton topbar must use the centered PageHeader grid.');
assertIncludes('index.html', 'class="initial-home-leading-placeholder ui-topbar-leading-placeholder"', 'initial home skeleton must reserve the same leading lane as HomeTopbar.');
assertIncludes('index.html', '<div class="initial-home-brand"></div>', 'initial home skeleton must leave the brand lane empty until React renders the real HomeTopbar brand.');
assertNotIncludes('index.html', 'initial-home-brand-vector', 'initial home skeleton must not render a fixed brand SVG placeholder.');
assertNotIncludes('index.html', 'home-topbar-brand-name">TuiTui</span>', 'initial home skeleton must not render a fixed brand text placeholder.');
assertNotIncludes('index.html', '.initial-home-topbar {\n        display: flex;', 'initial home skeleton topbar must not use the old left-brand flex layout.');
assertNotIncludes('index.html', '<div class="initial-home-brand">TuiTui</div>', 'initial home skeleton brand must not be a left-lane direct child.');
assertNotIncludes('index.html', '.initial-home-topbar {\n        display: flex;\n        align-items: center;\n        justify-content: space-between;', 'initial home skeleton topbar must not restore the old split layout.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-surface-card-glass', 'glass surface token is required.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-surface-card: var(--ui-product-glass-white-70);', 'card surfaces must consume the product glass surface token.');
assertNotIncludes('src/styles/00-product-tokens.css', '--ui-product-coral', 'old coral brand tokens must not return.');
assertNotIncludes('src/styles/00-product-tokens.css', '--ui-product-bluegrey', 'old bluegrey tag tokens must not return.');
assertNotIncludes('src/styles/00-product-tokens.css', '--ui-product-money', 'old green price tag tokens must not return.');
assertNotIncludes('src/styles/tokens/social-contracts.css', '--ui-ins-like: var(--ui-danger-classic);', 'like highlight must use the one product brand color, not red.');
assertNotIncludes('src/styles/system/ui-post-tag-contract.css', 'ui-product-bluegrey', 'location tags must not use a second accent color.');
assertNotIncludes('src/styles/system/ui-post-tag-contract.css', 'ui-product-money', 'price tags must not use a second accent color.');
assertIncludes('src/features/post/PostCard.tsx', 'FlameKindling', 'feed heat action must use the flame-and-kindling heat icon.');
assertIncludes('src/features/post-detail/PostDetailLegacySections.tsx', 'FlameKindling', 'detail heat action must use the flame-and-kindling heat icon.');
assertIncludes('src/features/post/PostCard.tsx', 'RadioTower', 'telegram sync action must use a neutral channel icon.');
assertNotIncludes('src/features/post/PostCard.tsx', 'ChartNoAxesColumnIncreasing', 'feed heat action must not restore the old abstract ranking icon.');
assertNotIncludes('src/pages/PostDetail.tsx', 'ChartNoAxesColumnIncreasing', 'detail heat action must not restore the old abstract ranking icon.');
assertNotIncludes('src/features/post/PostCard.tsx', 'TrendingUp', 'feed heat action must not restore the old abstract trend icon.');
assertNotIncludes('src/pages/PostDetail.tsx', 'TrendingUp', 'detail heat action must not restore the old abstract trend icon.');
assertNotIncludes('src/features/post/PostCard.tsx', 'SendHorizontal', 'telegram sync action must not restore the generic send icon.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-feed-action-active-color: var(--ui-brand);', 'feed actions must use the single product color only for active emphasis.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-feed-action-sync-color: var(--ui-social-action-muted);', 'telegram sync action must stay neutral by default.');
assertNotIncludes('src/styles/components/feed-card-actions-layout-v2.css', 'var(--ui-heat', 'feed heat action must not consume the legacy warm heat token.');
assertNotIncludes('src/styles/features/post-detail.css', 'var(--ui-heat', 'detail heat action must not consume the legacy warm heat token.');
assertNotIncludes('src/styles/components/feed-card-actions-layout-v2.css', 'var(--ui-warning, currentColor)', 'telegram sync status dot must not introduce a warning accent color.');
assertNotIncludes('src/styles/components/feed-card-actions-layout-v2.css', 'var(--ui-success, currentColor)', 'telegram sync status dot must not introduce a success accent color.');
assertNotIncludes('src/styles/components/feed-card-actions-layout-v2.css', '.feed-action-btn--telegram-sync::after', 'telegram sync action must not render a status-dot surface behind the channel icon.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-feed-card-list-gap', 'feed card list gap token is required.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-feed-card-max-width', 'feed card width must be a product token.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-social-feed-list-padding-x: var(--ui-space-none);', 'feed list must not add outer horizontal gutters.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-feed-card-list-gap: var(--ui-space-none);', 'feed rows must not be separated as cards.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-page-content-max-width', 'shared page content axis token is required.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-page-edge-padding-x', 'shared page edge padding token is required.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-floating-tabbar-shadow: none;', 'bottom nav must not render an outer shadow.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-floating-tabbar-border: color-mix(in srgb, var(--ui-product-ink) 6%, transparent);', 'bottom nav must keep a subtle Threads-style outline.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-topbar-surface-standard: var(--ui-surface-card-solid);', 'topbar surface must use the shared solid page chrome, not the card glass surface.');
assertIncludes('src/styles/components/topbar.css', '.nav-blur {\n    border-top: var(--ui-border-none);\n    border-bottom: var(--ui-border-none);\n    background: var(--ui-topbar-surface-standard);', 'topbar chrome must render the shared white surface without separators.');
assertIncludes('src/styles/components/topbar.css', '--ui-topbar-backdrop-filter: var(--ui-backdrop-filter-none);', 'topbar chrome must not render a filled blur layer.');
assertNotIncludes('src/styles/components/topbar.css', 'border-bottom: var(--ui-border-width-hairline) solid var(--ui-topbar-border-color);', 'shared topbar border line must stay removed.');
assertCssRuleIncludes(
  'src/styles/system/ui-topbar-compact-actions-contract.css',
  '.ui-topbar .ui-topbar-action-slot :is(\n    .ui-topbar-compact-action,\n    .ui-button-header,\n    .ui-button[data-action-size=\'header\'],\n    .record-header-select,\n    .ui-topbar-count-badge\n  )',
  [
    'backdrop-filter: var(--ui-backdrop-filter-none);',
    '-webkit-backdrop-filter: var(--ui-backdrop-filter-none);',
    'transition: var(--ui-transition-none);',
  ],
  'topbar compact actions and promotion filters must not shimmer while scrolling.',
);
assertIncludes('src/hooks/useMobileAddressBar.ts', 'function shouldUpdateLayoutHeight', 'mobile viewport layout height must be stabilized separately from visual height updates.');
assertIncludes('src/app/AppRequireTuiPlusRoute.tsx', '<AppPage mobileAddressBarScroll bottomSafe className="tui-plus-required-page surface-page">', 'Tui Plus route guard must render through the shared page shell.');
assertIncludes('src/app/AppRequireTuiPlusRoute.tsx', '<PageHeader title="推推会员" titleAlign="center"', 'Tui Plus route guard must own a stable page topbar behind its prompt dialog.');
assertIncludes('src/app/AppRequireTuiPlusRoute.tsx', '<PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">', 'Tui Plus route guard main content must use the shared page content shell.');
assertIncludes('src/app/AppRequireTuiPlusRoute.tsx', '<LazyTuiPlusBenefitPromptDialog', 'Tui Plus route guard prompt must be lazy-loaded so route protection does not inflate the main bundle.');
assertNotIncludes('src/app/AppRequireTuiPlusRoute.tsx', "import TuiPlusBenefitPromptDialog from '@/features/tui-plus/TuiPlusBenefitPromptDialog';", 'Tui Plus route guard must not statically import prompt dialog UI into the main route shell.');
assertNotIncludes('src/app/AppRequireTuiPlusRoute.tsx', '<PageContentShell className="ui-auth-required-wrap ui-app-page-main">', 'Tui Plus route guard must not bypass AppPage/PageHeader with a bare content shell.');
assertIncludes('src/app/AppShell.tsx', 'APP_ROUTES.legacyPromoteHistory,\n  APP_ROUTES.promotionEffects,', 'legacy promote history route must keep the workspace shell before redirect.');
assertIncludes('src/app/AppShell.tsx', 'pathname === APP_ROUTES.legacyPromoteHistory ||\n    pathname === APP_ROUTES.promotionEffects', 'legacy promote history route must resolve to the workspace desktop surface before redirect.');
assertIncludes('src/app/AppShell.tsx', 'APP_ROUTES.legacyPromotionEffects,\n  APP_ROUTES.recharge,', 'legacy promotion effects route must keep the workspace shell before redirect.');
assertIncludes('src/app/AppShell.tsx', 'pathname === APP_ROUTES.legacyPromotionEffects ||\n    pathname === APP_ROUTES.recharge', 'legacy promotion effects route must resolve to the workspace desktop surface before redirect.');
assertIncludes('src/ui/layoutViewport.ts', 'UI_USER_DESKTOP_MIN_WIDTH = 1024', 'user viewport breakpoint must have one shared UI runtime source.');
assertIncludes('src/ui/layoutViewport.ts', 'UI_USER_MOBILE_MAX_WIDTH = UI_USER_DESKTOP_MIN_WIDTH - 1', 'mobile max width must derive from the shared desktop breakpoint.');
assertIncludes('src/hooks/useIsMobile.ts', 'breakpoint = UI_USER_DESKTOP_MIN_WIDTH', 'mobile detection must consume the shared UI viewport contract.');
assertIncludes('src/hooks/useIsDesktopViewport.ts', 'breakpoint = UI_USER_DESKTOP_MIN_WIDTH', 'desktop detection must consume the shared UI viewport contract.');
assertIncludes('src/utils/feedScroll.ts', 'UI_USER_MOBILE_MEDIA_QUERY', 'feed document scroll mode must consume the shared UI viewport contract.');
assertIncludes('src/hooks/useMobileAddressBar.ts', 'UI_USER_DESKTOP_MIN_WIDTH', 'mobile address bar logic must consume the shared UI viewport contract.');
assertIncludes('src/ui/OptimizedImage.tsx', 'UI_DEFAULT_IMAGE_SIZES', 'optimized image sizes must consume the shared UI viewport contract.');
assertIncludes('src/features/feed/HomeAdBanner.tsx', 'UI_HOME_AD_IMAGE_SIZES', 'home ad images must consume the shared UI viewport contract.');
assertIncludes('src/features/profile/ProfileHeaderCover.tsx', 'UI_PROFILE_HEADER_COVER_SIZES', 'profile cover images must consume the shared UI viewport contract.');
assertIncludes('src/styles/tokens/feature-contracts.css', '--ui-referral-rules-overlay-z: var(--ui-z-dialog);', 'referral rules overlay must consume a semantic feature layer token.');
assertIncludes('src/styles/features/referral-invite.css', 'z-index: var(--ui-referral-rules-overlay-z);', 'referral rules overlay must consume its semantic feature layer token.');
assertNotIncludes('src/hooks/useIsMobile.ts', 'breakpoint = 1024', 'mobile detection must not hard-code the desktop breakpoint.');
assertNotIncludes('src/hooks/useIsDesktopViewport.ts', 'breakpoint = 1024', 'desktop detection must not hard-code the desktop breakpoint.');
assertNotIncludes('src/utils/feedScroll.ts', 'DOCUMENT_SCROLL_MAX_WIDTH_PX = 1023', 'feed scroll mode must not hard-code the mobile max breakpoint.');
assertNotIncludes('src/hooks/useMobileAddressBar.ts', 'MOBILE_WIDTH = 1024', 'mobile address bar logic must not hard-code the desktop breakpoint.');
assertNotIncludes('src/ui/OptimizedImage.tsx', "OPTIMIZED_IMAGE_MOBILE_QUERY = '(max-width: 768px)'", 'optimized image sizes must not own a separate mobile media query.');
assertNotIncludes('src/features/feed/HomeAdBanner.tsx', "HOME_AD_IMAGE_SIZES = '(max-width: 1023px) 100vw, 1180px'", 'home ad image sizes must not hard-code the user viewport breakpoint.');
assertNotIncludes('src/features/profile/ProfileHeaderCover.tsx', "PROFILE_HEADER_COVER_SIZES = '(max-width: 48rem) 100vw, 72rem'", 'profile cover image sizes must not own a separate media query.');
assertNotIncludes('src/styles/features/referral-invite.css', 'z-index: calc(var(--ui-z-modal) + 1);', 'referral rules overlay must not add ad hoc modal layer math.');
assertIncludes('src/utils/postCreateFocusPrime.ts', "textarea.className = 'ui-post-create-focus-bridge';", 'post create focus bridge must render through the shared focus bridge contract.');
assertNotIncludes('src/utils/postCreateFocusPrime.ts', "fontSize: '16px'", 'post create focus bridge must not hard-code mobile input font size.');
assertNotIncludes('src/utils/postCreateFocusPrime.ts', "zIndex: '2147483647'", 'post create focus bridge must not hard-code top-layer z-index.');
assertCssRuleIncludes(
  'src/styles/system/ui-input-focus-stability-contract.css',
  '.ui-post-create-focus-bridge',
  [
    'width: var(--ui-post-create-focus-bridge-size);',
    'font-size: var(--ui-post-create-focus-bridge-font-size);',
    'z-index: var(--ui-post-create-focus-bridge-z);',
  ],
  'post create focus bridge visual behavior must be owned by the shared CSS contract.',
);
assertCssRuleIncludes(
  'src/styles/system/ui-sticky-layer-contract.css',
  '.ui-topbar.nav-blur',
  [
    'border-top: var(--ui-border-none);',
    'border-bottom: var(--ui-border-none);',
    'background: var(--ui-topbar-surface-standard);',
    'box-shadow: var(--ui-shadow-none);',
    'backdrop-filter: var(--ui-backdrop-filter-none);',
  ],
  'final topbar contract must keep page headers on the shared white surface after feature CSS.',
);
assertCssRuleIncludes(
  'src/styles/system/ui-sticky-layer-contract.css',
  '.ui-topbar.ui-layer-page-header',
  ['transition: var(--ui-transition-none);'],
  'sticky topbar must not animate chrome while mobile scrolling changes viewport metrics.',
);
assertNotIncludes('src/features/promote/PromoteMobilePage.tsx', 'mobileAddressBarScroll', 'promote page must not register a nested mobile addressbar scroll container.');
assertIncludes('src/features/promote/PromoteMobilePage.tsx', 'className="promote-mobile-page promote-page surface-page"', 'promote auth state must share the same stable page contract.');
assertNotIncludes('src/pages/PromoteHistory.tsx', 'mobileAddressBarScroll', 'promotion history must not register a nested mobile addressbar scroll container.');
assertIncludes('src/pages/PromoteHistory.tsx', 'className="promote-mobile-page promote-page surface-page"', 'promotion history must share the same stable promote page contract.');
assertIncludes('src/styles/features/promote-layout-shell.css', '.promote-mobile-page > .ui-topbar', 'promote topbar must own a stable scroll contract.');
assertIncludes('src/styles/features/promote-layout-shell.css', 'overflow-x: visible;', 'promote page root must not create a clipping context above the sticky topbar.');
assertIncludes('src/styles/features/promote-layout-shell.css', 'overflow-x: clip;\n    padding: var(--ui-space-none) var(--ui-page-padding-x)', 'promote horizontal clipping must live in the content shell below the sticky topbar.');
assertNotIncludes('src/pages/UserSpace.tsx', 'mobileAddressBarScroll', 'user-space page must not register a nested mobile addressbar scroll container.');
assertIncludes('src/styles/features/user-space-shell.css', '.user-space-page-next.ui-page-enter', 'user-space page must opt out of page enter transforms that destabilize sticky topbars.');
assertCssRuleIncludes(
  'src/styles/system/ui-sticky-layer-contract.css',
  '.ui-layer-sticky-tab',
  [
    'position: sticky;',
    'top: var(--ui-sticky-tab-top);',
    'z-index: var(--ui-z-sticky-tab);',
    'flex: 0 0 auto;',
    'border-top: var(--ui-border-none);',
    'border-bottom: var(--ui-border-none);',
    'background: var(--ui-topbar-surface-standard);',
  ],
  'sticky tab chrome must be owned by the shared solid page chrome contract.',
);
assertIncludes('src/features/home/HomeChrome.tsx', 'home-topic-tabs-sticky-shell ui-layer-sticky-tab', 'home category/filter chrome must use the shared sticky tab layer.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', 'profile-tabs-section ui-layer-sticky-tab', 'profile tabs must use the shared sticky tab layer.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', '{ key: "QUOTES", label: "引用" }', 'profile tabs must include the quotes tab.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', 'quotedOnly: true,', 'profile quotes tab must request only quote posts.');
assertIncludes('src/features/profile/profilePageSections.tsx', '<EmptyStateCard title="暂无引用内容" />', 'profile quotes tab must have its own empty state.');
assertIncludes('src/services/api.ts', 'quotedOnly?: boolean', 'posts API client must support quotedOnly filters.');
assertIncludes('server/routes/post.routes.ts', "quotedOnly: quotedOnly === 'true'", 'posts route must pass the quotedOnly filter to the service.');
assertIncludes('server/services/post/index.ts', 'whereClause.quotedPostId = { not: null };', 'post service must filter quote posts at the database source.');
assertIncludes('src/features/profile/ProfileHeaderCover.tsx', 'disableOptimization', 'profile cover must load the original source for clarity.');
assertIncludes('src/styles/tokens/feature-contracts.css', '--ui-profile-cover-image-opacity: 1;', 'profile cover images must stay fully opaque.');
assertIncludes('src/styles/features/profile-shared-cover-effects.css', 'opacity: var(--ui-profile-cover-pattern-opacity);', 'profile cover texture overlay must use the shared subtle opacity token.');
assertIncludes('src/styles/tokens/feature-contracts.css', '--ui-profile-cover-pattern-opacity: 0.18;', 'profile cover texture overlay must stay subtle.');
assertIncludes('src/features/upload/imageUploadConfig.ts', 'export const COVER_UPLOAD_RETRY_OPTIONS', 'cover uploads must use a shared retry strategy.');
assertIncludes('src/features/upload/imageUploadConfig.ts', 'maxWidth: 2400,\n    maxHeight: 960,', 'cover uploads must pre-compress to a high-density display size.');
assertIncludes('src/pages/UserSpace.tsx', '...COVER_UPLOAD_RETRY_OPTIONS', 'user-space cover upload must use the shared cover retry strategy.');
assertIncludes('src/features/profile/useProfileMediaUploads.ts', '...COVER_UPLOAD_RETRY_OPTIONS', 'profile cover upload must use the shared cover retry strategy.');
assertIncludes('src/styles/features/profile-modern.css', '--ui-sticky-tab-top: var(--ui-profile-sticky-tab-top);', 'own profile tabs must stick to the top edge through the profile-specific sticky tab contract.');
assertIncludes('src/styles/features/profile-modern.css', 'z-index: var(--ui-z-page-header);', 'own profile tabs must sit above the transparent reserved topbar while stuck.');
assertIncludes('src/features/home/HomeChrome.tsx', '<HomeTopbar onlineCountText={onlineCountText} />', 'real home chrome must render through the shared HomeTopbar component.');
assertIncludes('src/ui/Skeleton.tsx', '<HomeChrome', 'home skeleton chrome must render through the same HomeChrome path as the real home page.');
assertIncludes('src/ui/Skeleton.tsx', 'visualState="skeleton"', 'home skeleton chrome must explicitly render the skeleton visual state.');
assertNotIncludes('src/ui/Skeleton.tsx', 'home-page-skeleton-online-badge', 'home skeleton must not duplicate the online badge layout.');
assertIncludes('src/features/home/HomeChrome.tsx', 'home-topic-tabs-sticky-shell ui-layer-sticky-tab', 'home skeleton topic shell must use the shared sticky tab layer.');
assertIncludes('src/ui/Skeleton.tsx', 'activeHomeTopicTabId={DEFAULT_HOME_TOPIC_TAB_ID}', 'home skeleton active tab must match the real default Hot tab instead of first-child.');
assertNotIncludes('src/styles/system/ui-skeleton-home.css', '.home-page-skeleton-topic-tab:first-child', 'home skeleton must not infer selected tab from first-child.');
assertIncludes('index.html', 'initial-home-topic-tab initial-home-topic-tab--active', 'first-paint home skeleton must mark the Hot tab explicitly.');
assertNotIncludes('index.html', '.initial-home-topic-tab:first-child', 'first-paint home skeleton must not flash the first tab as active.');
assertNotIncludes('index.html', '--initial-brand:', 'first-paint home skeleton must not define a special active-tab brand token.');
assertNotIncludes('index.html', '.initial-home-topic-tab--active {', 'first-paint home skeleton active tab must not have special visual styling.');
assertNotIncludes('index.html', '.initial-home-topic-tab--active {\n        background: var(--initial-text);', 'first-paint home skeleton active tab must not use black text color.');
assertNotIncludes('src/styles/system/ui-skeleton-home.css', '.home-page-skeleton-topic-tab--active {', 'home skeleton active tab must not have special visual styling.');
assertNotIncludes('src/styles/system/ui-skeleton-home.css', 'background: var(--ui-home-topic-tab-surface-active);', 'home skeleton active tab must not use a selected surface token.');
assertNotIncludes('src/styles/system/ui-skeleton-home.css', '.home-page-skeleton-brand', 'home skeleton must not own brand geometry.');
assertNotIncludes('src/styles/system/ui-skeleton-home.css', '.home-page-skeleton-topbar', 'home skeleton topbar geometry must be owned by PageHeader, not a duplicate skeleton selector.');
assertNotIncludes('src/styles/layers/contracts.css', 'ui-visual-contract.css', 'late visual catch-all contract must stay removed.');
assertNotIncludes('src/styles/00-product-tokens.css', '--ui-topbar-surface-standard: color-mix(in srgb, var(--ui-color-white)', 'product tokens must not restore a white translucent topbar surface.');
assertNotIncludes('src/styles/00-product-tokens.css', '--ui-topbar-surface-standard: var(--ui-surface-page);', 'product tokens must not restore a filled topbar surface.');
assertNotIncludes('src/styles/00-product-tokens.css', '--ui-topbar-surface-standard: transparent;', 'product tokens must not restore transparent page headers.');
assertCssRuleIncludes(
  'src/styles/features/home-topic-tabs-shell.css',
  '.home-topic-tabs-sticky-shell',
  [
    'position: sticky;',
    'top: var(--ui-sticky-tab-top);',
    'max-height: var(--home-topic-tabs-shell-height);',
  ],
  'home top category shell contract is required.',
);
assertNotIncludes('src/styles/features/home-topic-tabs-shell.css', 'background: color-mix(in srgb, var(--ui-color-white) 90%, transparent);', 'home top category shell must not render a filled strip behind tabs.');
assertCssRuleIncludes(
  'src/styles/features/home-topic-tabs-shell.css',
  '.home-topic-tabs-shell',
  ['background: var(--ui-topbar-surface-standard);'],
  'home category tabs shell must render the shared solid page chrome surface.',
);
assertCssRuleIncludes(
  'src/styles/features/home-topic-tabs-shell.css',
  '.home-topic-filter-row',
  ['background: var(--ui-topbar-surface-standard);'],
  'home filter row must render the shared solid page chrome surface.',
);
assertCssRuleIncludes(
  'src/styles/features/home-topic-tabs-shell.css',
  '.home-topic-tabs-list',
  ['display: flex;', 'width: 100%;', 'min-width: 0;', 'overflow-x: auto;', 'scroll-snap-type: x proximity;', 'touch-action: pan-x;'],
  'home topic tabs must support horizontal scrolling as categories grow.',
);
assertCssRuleIncludes(
  'src/styles/features/home-topic-tabs-shell.css',
  '.home-topic-tab {',
  ['width: auto;', 'min-width: var(--ui-home-topic-tab-min-width);', 'flex: 0 0 auto;', 'scroll-snap-align: start;'],
  'home topic tab items must keep stable readable widths inside the horizontal rail.',
);
assertCssRuleIncludes(
  'src/styles/components/feed-card-content.css',
  '.x-card-content-frame',
  ['position: relative;', 'display: block;', 'min-width: 0;'],
  'feed card expand control must anchor inside the text frame instead of occupying a separate row.',
);
assertCssRuleIncludes(
  'src/styles/components/feed-card-content.css',
  '.ins-post-card',
  ['--x-card-expand-hit-width:', '--x-card-expand-hit-height:', '--x-card-expand-icon-offset-y:'],
  'feed card expand control must keep a dedicated enlarged hit area.',
);
assertCssRuleIncludes(
  'src/styles/components/feed-card-content.css',
  '.ins-post-card .x-card-expand-button',
  ['position: absolute;', 'right: var(--ui-space-none);', 'bottom: calc((1lh - var(--x-card-expand-hit-height)) / 2);', 'width: var(--x-card-expand-hit-width);', 'justify-content: flex-end;', 'color: var(--ui-post-chip-text);', 'font-size: inherit;', 'line-height: inherit;'],
  'feed card expand icon must align to the final text line, match post chip text color, and keep an enlarged left-side hit area.',
);
assertCssRuleIncludes(
  'src/styles/components/feed-card-content.css',
  '.ins-post-card .x-card-expand-icon',
  ['transform: translateY(var(--x-card-expand-icon-offset-y));'],
  'feed card expand icon must sit optically on the final text line.',
);
assertNotIncludes('src/styles/components/feed-card-content.css', 'grid-row: 2;', 'feed card expand icon must not return to its own second row.');
assertNotIncludes(
  'src/features/profile/ProfileEditDialogs.tsx',
  'description=',
  'profile edit dialogs must keep concise titles without subtitle copy.',
);
assertNotIncludes(
  'src/features/tui-plus/TuiPlusBenefitPromptDialog.tsx',
  'description={copy.description}',
  'Tui Plus benefit prompt must not render subtitle copy.',
);
assertNotIncludes(
  'src/features/tui-plus/tuiPlusBenefits.ts',
  'description:',
  'Tui Plus benefit prompt copy must keep one concise body sentence instead of subtitle copy.',
);
assertNotIncludes(
  'src/features/post/AnchoredActionMenuPanel.tsx',
  'description=',
  'feed card more menu rows must not render per-action subtitles.',
);
assertNotIncludes(
  'src/styles/components/feed-card-options-menu.css',
  'feed-card-options-sheet-button-desc',
  'feed card more menu must not retain subtitle-only layout styles.',
);
assertCssRuleIncludes(
  'src/styles/components/media.css',
  '.media-carousel-track',
  ['overflow-x: auto;', 'overscroll-behavior-x: contain;', 'scroll-snap-type: x mandatory;', 'touch-action: pan-x pan-y;'],
  'feed media carousel must use a native horizontal snap rail that can be swiped inside the feed.',
);
assertCssRuleIncludes(
  'src/styles/components/media.css',
  '.media-carousel-slide',
  ['flex: 0 0 var(--ui-media-carousel-slide-width);', 'width: var(--ui-media-carousel-slide-width);', 'scroll-snap-align: start;', 'scroll-snap-stop: always;'],
  'feed media carousel slides must fill the rail one image at a time.',
);
assertIncludes(
  'src/features/post/PostMediaGrid.tsx',
  'const shouldEagerLoad = total > 1 || isPriorityImage;',
  'feed media carousel must request all visible carousel images before the user swipes to the next slide.',
);
assertIncludes(
  'src/features/post/PostMediaGrid.tsx',
  "fetchPriority={fetchPriority}",
  'feed media carousel must keep explicit fetch priority instead of relying on lazy defaults.',
);
assertIncludes(
  'src/ui/ImageLightbox.tsx',
  'className="lightbox-track"',
  'image lightbox must render a real swipe track instead of swapping a single image in place.',
);
assertIncludes(
  'src/ui/ImageLightbox.tsx',
  'aria-roledescription={hasMulti ? \'carousel\' : undefined}',
  'image lightbox must expose carousel semantics for multi-image posts.',
);
assertIncludes(
  'src/ui/ImageLightbox.tsx',
  'className="ui-lightbox-control ui-lightbox-nav ui-lightbox-nav--prev"',
  'image lightbox must keep visible previous navigation for desktop and keyboard parity.',
);
assertIncludes(
  'src/ui/ImageLightbox.tsx',
  'className="ui-lightbox-picker"',
  'image lightbox must keep direct slide picker affordance for multi-image posts.',
);
assertCssRuleIncludes(
  'src/styles/features/home-topic-tabs-shell.css',
  '.home-topic-tab-label',
  [
    'display: inline-block;',
    'width: auto;',
    'min-width: 0;',
    'max-width: 100%;',
    'overflow: visible;',
    'line-height: var(--ui-line-normal);',
    'text-overflow: clip;',
    'white-space: nowrap;',
  ],
  'home topic tab labels must size to their full text without clipping.',
);
assertIncludes('src/styles/00-product-tokens.css', '--ui-home-topic-tab-active-shadow: none;', 'home topic active tab must not regain a selected shadow.');
assertCssRuleIncludes(
  'src/styles/system/ui-primitives-interactions.css',
  ".ui-segment-tab[aria-selected='true'],",
  ['box-shadow: none;'],
  'shared selected segment tabs must not render an extra selected shadow.',
);
assertNotIncludes('src/styles/features/home-topic-tabs-shell.css', '.home-topic-tab-label {\n    display: inline-block;\n    width: auto;\n    flex: 0 1 auto;\n    min-width: 0;\n    overflow: hidden;', 'home topic tab labels must not be clipped.');
assertNotIncludes('src/styles/features/post-detail.css', '.detail-page-topbar {\n    position: sticky;\n    top: 0;\n    right: 0;\n    left: 0;\n    z-index: var(--z-topbar);\n    box-sizing: border-box;\n    min-height: calc(var(--ui-topbar-height) + env(safe-area-inset-top));\n    width: 100%;\n    border-bottom: 0;\n    background: var(--ui-topbar-surface-standard);', 'detail topbar must not restore a filled surface.');
assertNotIncludes('src/styles/features/category-feed.css', '.category-feed-page .ui-topbar', 'category page must not own topbar chrome.');
assertNotIncludes('src/styles/features/category-feed.css', 'category-feed-page .nav-blur {\n    border-bottom: var(--ui-border-width-hairline)', 'category topbar must not restore a separator line.');
assertNotIncludes('src/styles/features/category-feed.css', 'box-shadow: var(--ui-social-topbar-shadow);', 'category topbar must not restore its own shadow.');
assertNotIncludes('src/styles/features/post-detail.css', 'border-bottom: var(--ui-border-width-hairline) solid var(--ui-topbar-border-color);', 'detail topbar must not restore a separator line.');
assertNotIncludes('src/styles/system/ui-skeleton-home.css', '.home-page-skeleton-topbar {\n    display: flex;\n    min-height: calc(var(--ui-topbar-height) + env(safe-area-inset-top));\n    align-items: center;\n    justify-content: space-between;\n    border-bottom: var(--ui-border-width-hairline)', 'topbar skeleton must not restore a separator line.');
assertNotIncludes('src/styles/system/ui-skeleton-home.css', '.home-page-skeleton-topbar {\n    display: flex;', 'home skeleton topbar must not use the old left-brand flex layout.');
assertNotIncludes('src/styles/system/ui-skeleton-home.css', 'background: var(--ui-topbar-surface-home, var(--ui-topbar-surface-standard));', 'home skeleton topbar must not own a filled surface.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-topbar-edge-padding-x: var(--ui-page-edge-padding-x);', 'product tokens must preserve the shared page edge axis.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-topbar-back-icon-offset-x: calc(var(--ui-space-2) * -1);', 'product tokens must expose the back icon optical offset.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-topbar-back-track-size: var(--ui-control-sm);', 'product tokens must expose a compact visual back track without shrinking the tap target.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-topbar-back-title-gap: var(--ui-space-2);', 'product tokens must expose the shared back-title rhythm.');
assertNotIncludes('src/styles/system/ui-detail-topbar-identity-contract.css', '--ui-topbar-control-size:', 'detail topbar identity must not shrink the shared back button hit target.');
assertNotIncludes('src/styles/system/ui-detail-topbar-identity-contract.css', '--ui-topbar-back-icon-offset-x: 0;', 'detail topbar identity must not cancel the shared back icon optical offset.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-dialog-mobile-available-height:', 'product tokens must expose keyboard-safe mobile dialog height.');
assertCssRuleIncludes(
  'src/styles/components/topbar.css',
  '.ui-topbar-leading-slot .ui-topbar-slot-item > .ui-topbar-back-button:only-child',
  ['margin-inline: calc((var(--ui-topbar-back-track-size) - var(--ui-topbar-control-size)) / 2);'],
  'topbar back buttons must use the compact visual track while preserving the shared hit target.',
);
assertIncludes('src/styles/components/profile-dialog.css', 'padding-top: calc(env(safe-area-inset-top) + var(--ui-space-4));', 'mobile profile dialogs must open near the top edge for keyboard-safe editing.');
assertIncludes('src/styles/components/profile-dialog.css', 'max-height: var(--ui-dialog-mobile-available-height);', 'mobile profile dialogs must use the keyboard-safe visual viewport height.');
assertIncludes('src/features/profile/ProfileDialog.tsx', "useFocusScrollStabilizer('profile-dialog-keyboard-active')", 'profile dialogs must stabilize focused inputs against the visual keyboard viewport.');
assertNotIncludes('src/styles/features/profile-avatar-action.css', "content: '+';", 'profile avatar action must use the camera icon, not a plus pseudo-element.');
assertIncludes('src/features/profile/useProfileMediaUploads.ts', 'avatarInputRef.current?.click();', 'profile avatar button must open the avatar file picker.');
assertIncludes('src/styles/features/profile-security-shell.css', 'padding: var(--ui-dialog-mobile-top-offset) var(--ui-space-2) var(--ui-dialog-mobile-bottom-inset);', 'mobile account information sheet must open higher than the keyboard-safe bottom edge.');
assertIncludes('src/styles/features/profile-security-shell.css', 'max-height: var(--ui-dialog-mobile-available-height);', 'mobile account information sheet must use the keyboard-safe visual viewport height.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-feed-list-padding-x: var(--ui-social-feed-list-padding-x);', 'product tokens must preserve the shared feed gutter axis.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-feed-card-list-gap: var(--ui-space-none);', 'product tokens must keep feed rows as a continuous list.');
assertNotIncludes('src/styles/layers/contracts.css', 'detail-article--desktop', 'contracts layer must not restore page-specific desktop feed cards.');
assertNotIncludes('src/styles/system/feed-scroll-shell.css', 'max-width: var(--ui-social-feed-list-max-width);', 'feed scroll shell must not constrain card width.');
assertIncludes('src/styles/system/ui-post-tag-contract.css', ".post-tag-chip[data-chip-kind='price']", 'post meta price chip contract is required.');
assertIncludes('src/styles/system/ui-post-tag-contract.css', '--ui-post-chip-surface:', 'post chips must use one shared surface token.');
assertNotIncludes('src/styles/system/ui-post-tag-contract.css', '--ui-post-chip-category-surface', 'post chips must not split visual styles by category kind.');
assertNotIncludes('src/styles/system/ui-post-tag-contract.css', '--ui-post-chip-location-surface', 'post chips must not split visual styles by location kind.');
assertNotIncludes('src/styles/system/ui-post-tag-contract.css', '--ui-post-chip-price-surface', 'post chips must not split visual styles by price kind.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', '@/ui/Skeleton', 'detail page must not import skeleton UI; detail loading uses normal loading states.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', '<Skeleton', 'detail page must not render skeleton placeholders.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', 'DetailArticleSkeleton', 'detail initial loading must not define or render an article skeleton.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', 'DetailBottomBarSkeleton', 'detail initial loading must not define or render a bottom skeleton bar.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', 'DetailQuotesLoadingRows', 'detail quote loading must not render skeleton rows.');
assertNotIncludes('src/styles/features/post-detail.css', 'skeleton', 'detail CSS must not keep detail skeleton selectors.');
assertIncludes('src/features/post-detail/PostDetailLegacySections.tsx', '<LoadingBlock text="正在加载帖子详情"', 'detail initial loading must use a normal loading block.');
assertIncludes('src/features/post-detail/PostDetailInteractionsSection.tsx', 'const isInitialLoading = !hasLoadedInteractions', 'detail quote cards must not flash an empty state before the first page settles.');
assertIncludes('src/features/post-detail/PostDetailInteractionsSection.tsx', 'const canShowEmpty = !isInitialLoading && !interactionError && interactionCount > 0 && interactions.length === 0;', 'detail quote empty state must wait for settled fetching.');
assertIncludes('src/features/post-detail/usePostDetailLikeWall.ts', 'const visibleLikeWallTotal = Math.max(0, Number(likeCount || 0));', 'detail like wall total must not fall back to stale liker endpoint totals.');
assertIncludes('src/features/post-detail/PostDetailLegacySections.tsx', 'text="正在加载点赞"', 'detail like wall must use ordinary loading while liker avatars are arriving.');
assertIncludes('src/features/post-detail/PostDetailLegacySections.tsx', 'const remainingLikeCount = Math.max(0, safeTotal - likers.length);', 'detail like wall must show a +N indicator for likers beyond the capped avatar batch.');
assertIncludes('src/features/post-detail/PostDetailLegacySections.tsx', 'className="detail-like-wall-more"', 'detail like wall +N indicator must render as text instead of an avatar chip.');
assertNotIncludes('src/features/post-detail/PostDetailLegacySections.tsx', 'className="detail-like-wall-avatar-frame detail-like-wall-more"', 'detail like wall +N indicator must not reuse circular avatar geometry.');
assertIncludes('src/styles/features/post-detail-engagement.css', '.detail-like-wall-more', 'detail like wall +N indicator must have a dedicated muted text style.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', '引用已全部显示', 'detail quotes must not show a completion message when all quotes are already displayed.');
assertNotIncludes('src/features/post/PostQuoteSheet.tsx', '引用已全部显示', 'quote sheet must not show a completion message when all quotes are already displayed.');
assertIncludes('src/features/feed/FeedViewportStates.tsx', 'ui-feed-empty-plain-state', 'home feed empty states must expose a dedicated empty-state layout kind.');
assertNotIncludes('src/features/home/HomeFeedContent.tsx', 'HomeStandalonePlainState', 'home empty and error states must not bypass the shared feed viewport.');
assertIncludes('src/features/home/HomeFeedContent.tsx', '<FeedViewport', 'mobile and desktop home feed states must use the shared feed viewport.');
assertIncludes('src/features/feed/FeedViewport.tsx', '<EmptyState onBrowseAll={guardedBrowseAll} />', 'home empty state must use the dedicated shared empty layout.');
assertIncludes('src/styles/features/home-feed-state.css', '.ui-feed-empty-plain-state', 'home empty state must have a dedicated stable layout.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const isDetailMobile = !isDesktopViewport;', 'post detail layout must derive mobile/desktop from the real viewport.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const isOverlayDetail = isDetailMobile && Boolean(routeState?.backgroundLocation?.pathname);', 'desktop detail pages must render inside the framed app shell instead of using the mobile route overlay.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const shouldUseDetailPageScroll = false;', 'overlay detail must leave the route overlay as the only mobile addressbar scroll target.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', 'calc(var(--app-desktop-main-active-width) - (var(--ui-app-shell-desktop-padding-x) * 2))', 'desktop secondary pages must use the framed app shell inner content width.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', '--ui-topbar-content-max-width: var(--app-desktop-page-content-width);', 'desktop secondary page topbars must inherit the framed content width.');
assertIncludes('src/styles/features/recharge.css', '--ui-recharge-page-max: var(--app-desktop-page-content-width);', 'desktop recharge content must align to the shared framed content width.');
assertIncludes('src/styles/features/recharge.css', '.recharge-step--amount {\n      display: grid;\n      grid-template-columns:', 'desktop recharge amount entry must use a multi-column workspace layout.');
assertIncludes('src/styles/features/recharge.css', '.recharge-payment-panel {\n      display: grid;\n      grid-template-columns:', 'desktop recharge payment instructions must use a multi-column workspace layout.');
assertIncludes('src/styles/features/sponsor.css', 'max-width: var(--app-desktop-page-content-width);', 'desktop sponsor workbench must align to the shared framed workspace content width.');
assertIncludes('src/styles/features/sponsor.css', '.sponsor-page .sponsor-workbench {\n      display: grid;\n      grid-template-columns:', 'desktop sponsor workbench must place balance actions and referral entry side by side.');
assertIncludes('src/styles/features/sponsor.css', '.sponsor-page .sponsor-record-list {\n      max-width: var(--app-desktop-page-content-width);\n      display: grid;', 'desktop sponsor record previews must use a multi-column list.');
assertIncludes('src/styles/features/referral-invite.css', '--ui-referral-page-content-max: var(--app-desktop-page-content-width);', 'desktop referral invite content must align to the shared framed workspace content width.');
assertIncludes('src/styles/features/referral-invite.css', '.referral-page-content {\n      grid-template-columns:', 'desktop referral invite overview and share cards must use a two-column layout.');
assertIncludes('src/styles/features/referral-invite.css', '.referral-record-list {\n      width: 100%;\n      max-width: var(--app-desktop-page-content-width);', 'desktop referral records must not remain constrained to the narrow mobile record list width.');
assertIncludes('src/styles/features/referral-invite.css', 'grid-template-columns: repeat(2, minmax(0, 1fr));', 'desktop referral records must use a multi-column list.');
assertIncludes('src/pages/BrandAbout.tsx', "import '@/features/brand/BrandAboutRoute.css';", 'about page CSS must load with the lazy about route.');
assertIncludes('src/features/brand/BrandAboutRoute.css', '@import "../../styles/features/brand.css";', 'about route CSS facade must own brand.css.');
assertIncludes('src/styles/features/brand.css', "data-desktop-surface='content'] .brand-about-main", 'desktop about page content must align to the shared framed content width.');
assertIncludes('src/styles/features/brand.css', '.brand-about-main {\n      display: grid;\n      grid-template-columns: repeat(2, minmax(0, 1fr));', 'desktop about page sections must use a multi-column content layout.');
assertIncludes('src/styles/system/record-card-contract.css', '--ui-record-list-content-max: var(--app-desktop-page-content-width);', 'desktop record pages must align lists to the shared framed workspace content width.');
assertIncludes('src/styles/system/ui-primitives-auth.css', '--ui-auth-required-wrap-max: var(--app-desktop-page-content-width);', 'desktop auth-required states must align to the shared framed page content width.');
assertIncludes('src/styles/system/ui-primitives-auth.css', 'max-width: var(--ui-auth-required-wrap-max);', 'desktop auth-required states must override the default narrow content shell max width.');
assertIncludes('src/styles/features/tui-plus-page.css', '--ui-tui-plus-content-max: var(--app-desktop-page-content-width);', 'desktop Tui Plus content and CTA must align to the shared framed workspace content width.');
assertIncludes('src/styles/features/messages.css', '--ui-message-settings-content-max: var(--app-desktop-page-content-width);', 'desktop message and settings content must align to the shared framed content width.');
assertIncludes('src/styles/features/promote-layout-shell.css', '--ui-promote-page-content-max: var(--app-desktop-page-content-width);', 'desktop promote content must align to the shared framed workspace content width.');
assertIncludes('src/styles/features/promote-layout-checkout-bar.css', 'max-width: min(100%, var(--ui-promote-page-content-max));', 'desktop promote checkout content must align to the promote workspace width.');
assertIncludes('src/styles/features/promote-layout-picker-sheet.css', 'max-width: min(100%, var(--ui-promote-page-content-max));', 'desktop promote picker sheets must align to the promote workspace width.');
assertIncludes('src/styles/features/tui-plus-checkout.css', 'max-width: min(100%, var(--ui-tui-plus-content-max, var(--ui-page-content-max-width)));', 'desktop Tui Plus checkout content must align to the Tui Plus workspace width.');
assertIncludes('src/styles/system/ui-design-contract-tokens.css', '--ui-profile-header-max-width: var(--ui-profile-content-max-width);', 'profile header width must depend on the profile content token, not the home feed token.');
assertIncludes('src/styles/features/profile-modern.css', '--ui-profile-content-max-width: var(--app-desktop-page-content-width);', 'desktop profile content must align to the framed profile content width.');
assertNotIncludes('src/styles/system/ui-design-contract-tokens.css', '--ui-profile-header-max-width: var(--ui-home-desktop-feed-width);', 'profile header must not depend on the home feed reading width.');
assertNotIncludes('src/styles/features/promote-layout-shell.css', 'var(--ui-home-desktop-feed-width)', 'promote content must not depend on the home feed reading width.');
assertNotIncludes('src/styles/features/promote-layout-checkout-bar.css', 'var(--ui-home-desktop-feed-width)', 'promote checkout must not depend on the home feed reading width.');
assertNotIncludes('src/styles/features/promote-layout-picker-sheet.css', 'var(--ui-home-desktop-feed-width)', 'promote picker sheets must not depend on the home feed reading width.');
assertNotIncludes('src/styles/features/tui-plus-checkout.css', 'var(--ui-home-desktop-feed-width)', 'Tui Plus checkout must not depend on the home feed reading width.');
assertIncludes('src/utils/postPresentation.ts', 'const LOCATION_SPLIT_PATTERN = /\\s+-\\s+|[·>＞、，,;；|/\\n]+/;', 'card location display must understand middle-dot location hierarchy.');
assertIncludes('src/utils/postStructuredMeta.ts', "if (normalizeKey(key) === 'location') return selectFinestDisplayLocation(formatted) || formatted;", 'structured card location display must keep only the leaf node.');
assertNotIncludes('src/styles/system/ui-post-tag-contract.css', 'They are text links', 'old text-link tag contract must not return.');
assertIncludes('src/styles/components/feed-card-chrome.css', 'gap: var(--ui-feed-card-list-gap);', 'feed list must use card gap token.');
assertIncludes('src/styles/components/feed-card-chrome.css', 'box-sizing: border-box;', 'feed list width must include its own gutter padding.');
assertNotIncludes('src/styles/components/feed-card-chrome.css', 'ui-feed-panel', 'old feed panel shell must not return.');
assertNotIncludes('src/styles/components/feed-card-shell.css', 'background: var(--ui-surface-card-glass)', 'feed rows must not use a glass card background.');
assertNotIncludes('src/styles/components/feed-card-shell.css', 'transform: scale(var(--ui-press-scale-card))', 'feed rows must not use card press scaling.');
assertNotIncludes('src/styles/components/feed-card-responsive.css', 'border-radius: var(--ui-ins-card-radius)', 'feed responsive layer must not restore card radius.');
assertNotIncludes('src/styles/components/feed-card-responsive.css', 'box-shadow: var(--ui-surface-card-shadow)', 'feed responsive layer must not restore card shadow.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-type-feed-author-size: var(--ui-type-feed-body-size);', 'feed card author names must match body text size.');
assertIncludes('src/features/post/AnchoredActionMenuPanel.tsx', "import { createPortal } from 'react-dom';", 'feed card menus must render through a viewport portal instead of inside clipped list cards.');
assertIncludes('src/features/post/AnchoredActionMenuPanel.tsx', 'feed-card-options-layer--portal', 'post options menu must use the shared viewport layer contract without forcing a popover shape.');
assertIncludes('src/features/post/AnchoredActionMenu.tsx', 'data-feed-card-options-menu={menuInstanceId}', 'feed card more menu must carry a stable menu instance id.');
assertIncludes('src/features/post/AnchoredActionMenuPanel.tsx', 'data-feed-card-options-surface={menuId}', 'feed card portal action sheet must carry the matching menu instance id.');
assertIncludes('src/features/post/AnchoredActionMenuPanel.tsx', 'eventPathContainsFeedMenu(event, menuId)', 'feed card portal action sheet must not close itself from its own pointer events.');
assertIncludes('src/features/post/AnchoredActionMenu.tsx', 'setInitialSurfaceStyle(getFeedMenuAnchorStyle(optionsTriggerRef.current));', 'feed card more menu must prepare anchored surface geometry before the first portal paint.');
assertIncludes('src/features/post/AnchoredActionMenu.tsx', 'onPointerDown={stopCardEvent}', 'feed card more menu pointerdown must only stop card navigation.');
assertNotIncludes('src/features/post/PostCard.tsx', 'skipNextTriggerClickRef', 'feed card more menu must not split touch and click toggles.');
assertNotIncludes('src/features/post/PostCard.tsx', 'handleTriggerPointerDown', 'feed card more menu trigger must use click as the single toggle path.');
assertIncludes('src/styles/components/post-quote.css', '--quoted-post-preview-media-size:', 'quoted post preview media must use a shared square size token.');
assertIncludes('src/styles/components/post-quote.css', 'aspect-ratio: 1 / 1;', 'quoted post preview media must stay square.');
assertNotIncludes('src/styles/components/feed-card-shell.css', '.ins-post-card:hover {\n    background: var(--ui-state-hover);', 'feed card rows must not change background on touch/hover.');
assertNotIncludes('src/styles/components/feed-card-shell.css', 'background: color-mix(in srgb, var(--ui-color-black) 3%, var(--ui-color-white));', 'feed card rows must not flash a pressed background.');
assertNotIncludes('src/features/post/PostCard.tsx', 'feed-card-avatar-plus', 'feed avatar plus action must not return.');
assertIncludes('src/features/post/PostCard.tsx', 'feed-card-inline-follow', 'feed card follow action must live beside the more menu.');
assertIncludes('src/styles/components/feed-card-shell.css', '--feed-card-author-row-height: max(var(--feed-card-author-avatar-size), var(--ui-feed-more-button-size));', 'feed card header must derive one shared vertical rhythm from avatar and action hit area.');
assertIncludes('src/styles/components/feed-card-shell.css', 'height: var(--feed-card-author-row-height);', 'feed card avatar column must share the author row height.');
assertIncludes('src/styles/components/feed-card-shell.css', 'min-height: var(--feed-card-author-row-height);', 'feed card author header must share the author row height.');
assertIncludes('src/styles/components/feed-card-shell.css', 'align-self: center;', 'feed card more menu must align to the shared author row center.');
assertIncludes('src/features/post/PostCard.tsx', 'rememberListReturnPosition(event.currentTarget);', 'feed avatar click must navigate to the user space.');
assertIncludes('src/styles/components/feed-card-shell.css', 'position: fixed;', 'feed card portal action sheets must be viewport-bound.');
assertIncludes('src/styles/components/feed-card-shell.css', '--ui-layer-panel-surface: var(--ui-surface-card-solid);', 'feed card action sheets must use a solid layer surface.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-social-popover-surface: var(--ui-social-panel-surface);', 'anchored social overlays must not inherit transparent card glass surfaces.');
assertIncludes('src/styles/features/profile-security-shell.css', 'background: var(--ui-layer-panel-surface);', 'profile edit sheet must use the shared solid layer panel surface.');
assertIncludes('src/features/upload/ImageUploadTile.tsx', 'className="ui-image-remove-btn pressable"', 'image upload remove action must use the shared readable overlay button.');
assertCssRuleIncludes(
  'src/styles/system/ui-primitives-upload.css',
  '.ui-image-remove-btn',
  ['position: absolute;', 'top: var(--ui-space-2);', 'right: var(--ui-space-2);', 'background: var(--ui-upload-remove-surface);', 'color: var(--ui-color-white);'],
  'image upload remove button must be consistently visible on post and ad image previews.',
);
assertIncludes('src/styles/tokens/layout-components.css', '--ui-home-ad-banner-ratio: 3.95 / 1;', 'home ad desktop ratio must keep the banner taller without becoming a hero block.');
assertIncludes('src/styles/tokens/layout-components.css', '--ui-home-ad-banner-ratio-mobile: 3.82 / 1;', 'home ad mobile ratio must stay balanced through a token.');
assertIncludes('src/styles/tokens/layout-components.css', '--ui-home-ad-progress-inset-inline: max(calc(var(--ui-space-8) * 2 + var(--ui-space-4)), 43%);', 'home ad progress must stay shorter and unobtrusive through a token.');
assertIncludes('src/styles/tokens/layout-components.css', '--ui-home-ad-progress-fill-surface: color-mix(in srgb, var(--ui-color-white) 8%, transparent);', 'home ad progress fill must stay weaker through a token.');
assertIncludes('src/styles/features/home-floating-ads.css', 'aspect-ratio: var(--ui-home-ad-banner-ratio-mobile);', 'home ad mobile ratio must be owned by CSS tokens.');
assertNotIncludes('src/features/feed/HomeAdBanner.tsx', 'ui-media-frame home-ad-slide', 'home ads must not inherit the shared media frame muted placeholder background.');
assertIncludes('src/styles/features/home-floating-ads.css', '.home-ad-stage {\n    position: relative;\n    background: transparent;', 'home ads must not render a gray backing behind the image.');
assertIncludes('src/styles/features/home-floating-ads.css', 'box-shadow: none;', 'home ads must sit on the same plain surface as the feed content.');
assertNotIncludes('src/styles/features/home-floating-ads.css', '0 var(--ui-space-1) var(--ui-space-3)', 'home ads must not restore the old gray banner shadow.');
assertIncludes('src/features/feed/HomeAdBanner.tsx', 'home-ad-progress__segment', 'home ad carousel must render the weak segmented progress indicator.');
assertIncludes('src/styles/features/home-motion.css', 'inset-inline: var(--ui-home-ad-progress-inset-inline);', 'home ad progress must use the shared weak progress width token.');
assertIncludes('src/styles/features/home-motion.css', 'height: var(--ui-border-width-hairline);', 'home ad progress must stay hairline-thin.');
assertIncludes('src/styles/features/home-motion.css', 'background: var(--ui-home-ad-progress-fill-surface);', 'home ad progress fill must stay subtle over the banner.');
assertNotIncludes('src/features/feed/HomeAdBanner.tsx', 'ui-ad-counter', 'home ad carousel must not restore the heavy numeric counter.');
assertNotIncludes('src/features/post/PostCard.tsx', 'CircleCheck', 'sent telegram sync cards must keep the original channel icon instead of a check icon.');
assertIncludes('src/features/post/PostCard.tsx', "showToast('已成功同步1次', 'success');", 'sent telegram sync cards must explain the synced state when tapped.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', "? '显示' : '隐藏'", 'post create contact summary must use show/hide labels.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', 'const isPublishingLocked = isSubmitting;', 'post create must only lock the page during the actual publish request.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', 'usePublishingNavigationGuard(isPublishingLocked, notifyPublishingNavigationBlocked);', 'post create must block page navigation while publishing without data-router-only hooks.');
assertNotIncludes('src/features/post-create/PostCreatePage.tsx', 'useBlocker', 'post create must not use data-router-only blockers in the browser router.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', "window.addEventListener('beforeunload', handleBeforeUnload)", 'post create must guard browser unload while publishing.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', "const submitLabel = isSubmitting ? '发表中' : isQuoteMode && isQuoteLoading ? '载入中' : '发表';", 'post create submit label must not switch to uploading while images are uploading.');
assertIncludes('src/features/post-create/postCreatePageSections.tsx', 'className="post-create-publishing-lock"', 'post create must render a normal publishing lock overlay.');
assertIncludes('src/styles/features/create-promote-post-editor.css', '.post-create-publishing-lock', 'post create publishing lock must be styled in the post editor CSS.');
assertIncludes('src/styles/features/create-promote-foundation.css', '--post-create-tool-button-width:', 'post create tool buttons must reserve a stable width for summaries.');
assertIncludes('src/styles/features/create-promote-foundation.css', '--post-create-tool-button-count: 5;', 'post create tool row must reserve one-line space for all five tools.');
assertIncludes('src/styles/features/create-promote-foundation.css', '--post-create-tool-row-gap: var(--ui-space-1);', 'post create tool row gap must stay compact enough for five inline summaries.');
assertIncludes('src/styles/features/create-promote-foundation.css', 'var(--post-create-tool-button-count) - 1', 'post create tool widths must be derived from the row gap and tool count.');
assertIncludes('src/styles/features/create-promote-post-editor.css', 'flex: 0 0 var(--post-create-tool-button-width);', 'post create tool buttons must not shift when summaries appear.');
assertIncludes('src/styles/features/create-promote-post-editor.css', '.image-upload-toolbar-trigger {\n    width: var(--post-create-tool-button-width);', 'post create image tool must share the same one-line slot width as the other tools.');
assertIncludes('src/styles/features/create-promote-post-editor.css', 'max-width: calc(100% - var(--post-create-tool-icon-size) - var(--ui-space-1));', 'post create tool summaries must not push icons onto a second line.');
assertMatches('src/features/promote/PromotionRecordCard.tsx', /<span className="record-time[^"]*">\{bookingDateText\(group\)\}<\/span>[\s\S]*?promote-history-related-post-link/, 'promotion related post detail must sit below the booking date.');
assertIncludes('src/utils/scrollLock.ts', 'let lastTouchX: number | null = null;', 'scroll lock must track horizontal gestures for sheet rails.');
assertIncludes('src/styles/features/home-structured-filters.css', 'grid-auto-flow: column;', 'home location country filter must use a horizontal rail contract.');
assertIncludes('server/services/public-user-profile.service.ts', 'contact: true,', 'public user profile must return contact for the user-space contact action.');
assertNotIncludes('src/pages/UserSpace.tsx', "displayUser?.userType !== 'ROBOT'", 'user-space contact action must not suppress robot/automation profiles that have contact info.');
assertNotIncludes('src/features/promote/PromoteMobilePage.tsx', 'PromoteFlowSummary', 'promote content page must not restore the top summary strip.');
assertNotIncludes('src/features/promote/PromoteMobilePage.tsx', 'SurfaceSectionCard', 'promote content page must use its own workflow contract instead of generic card wrappers.');
assertNotIncludes('src/features/promote/PromoteMobilePage.tsx', 'SettingRow', 'promote content target selection must not use the generic settings row.');
assertNotIncludes('src/features/promote/promoteComponents.tsx', 'PromoteFlowSummary', 'unused promote summary component must stay removed.');
assertNotIncludes('src/features/promote/promoteComponents.tsx', 'PageContentShell', 'promote checkout bar must not inherit page main shell geometry.');
assertNotIncludes('src/features/promote/promoteComponents.tsx', 'promote-checkout-shell ui-app-page-main', 'promote checkout shell must stay a viewport checkout contract, not page content.');
assertNotIncludes('src/features/promote/PromoteMobilePage.tsx', 'ui-bg-card ui-border-medium', 'promote selection state must not be built from generic utility class overrides.');
assertIncludes('src/features/promote/promoteComponents.tsx', 'promote-step-index', 'promote workflow steps must use the shared step header contract.');
assertIncludes('src/styles/00-promote-tokens.css', '--ui-promote-option-idle-surface: transparent;', 'promote idle options must not render filled backgrounds.');
assertIncludes('src/styles/features/promote-layout-shell.css', '.promote-mobile-page.ui-page-enter', 'promote page must opt out of page transform animation so fixed checkout stays viewport-bound.');
assertNotIncludes('src/styles/features/promote-layout-shell.css', 'promote-flow-summary', 'unused promote summary CSS must stay removed.');
assertNotIncludes('src/styles/features/promote-layout-shell.css', '--promote-idle-surface: var(--ui-action-muted-surface);', 'promote idle option background must not come back as a filled surface.');
assertNotIncludes('src/styles/features/promote-layout.css', 'create-promote-ads.css', 'old promote booking stylesheet must not be re-imported.');
assertIncludes('src/styles/features/promote-layout-choices.css', 'promote-type-card', 'promote booking responsive rules must stay in promote-layout choices.');
assertIncludes('src/styles/features/promote-layout-choices.css', '.promote-mobile-page .promote-target-empty', 'promote target empty state must use the workflow choices contract.');
assertIncludes('src/styles/features/promote-layout-checkout-bar.css', 'display: block;', 'promote checkout context must remain visible in the fixed checkout bar.');
assertIncludes('src/styles/system/secondary-page-actions.css', 'z-index: var(--ui-z-page-header);', 'checkout bars must use the shared secondary action layer contract.');
assertIncludes('src/styles/features/tui-plus-checkout.css', '--tui-plus-checkout-action-min-width: var(--ui-checkout-action-min-width);', 'Tui Plus checkout must use the shared checkout sizing token instead of promote-specific variables.');
assertNotIncludes('src/styles/features/tui-plus-visual.css', '--promote-checkout', 'Tui Plus visual CSS must not depend on promote checkout variables.');
assertIncludes('src/styles/system/secondary-page-actions.css', "--secondary-page-action-width: var(--app-desktop-page-content-width);", 'desktop workspace checkout bars must align to the framed page content width.');
assertIncludes('src/styles/components/bottom-nav.css', '.app-bottom-nav-icon-shell', 'floating tabbar icon shell is required.');
assertIncludes('src/styles/components/bottom-nav.css', '--ui-bottom-nav-page-bottom-space', 'bottom nav must expose a shared page avoidance token.');
assertNotIncludes('src/styles/components/bottom-nav.css', 'fill: currentColor', 'bottom nav active icons must stay outline style.');
assertIncludes('src/app/AppBottomNavigation.tsx', 'home-topic-tab-refresh', 'bottom home double tap must dispatch the home refresh event.');
assertIncludes('src/pages/Home.tsx', "window.addEventListener('home-topic-tab-refresh'", 'home page must listen for bottom-nav refresh requests.');
assertIncludes('src/features/post/PostCard.tsx', 'data-chip-kind', 'post card tags must carry semantic chip kind.');
assertIncludes('src/features/post/PostCard.tsx', 'stableAspectRatio', 'post card media must use stable media frame.');
assertNotIncludes('src/features/post/PostCard.tsx', 'ui-surface-card ins-post-card', 'feed post rows must not use the generic card surface class.');
assertNotIncludes('src/features/post/PostCard.tsx', 'data-surface-tone="glass"', 'feed post rows must not use glass card tone.');
assertNotIncludes('src/features/post/PostCard.tsx', 'BarChart3', 'post card view metric must not use chart icon.');
assertNotIncludes('src/pages/PostDetail.tsx', 'BarChart3', 'post detail view metric must not use chart icon.');
assertNotIncludes('src/features/profile/ProfileMobilePage.tsx', 'profile-action-metrics-row', 'profile recharge/promote shortcut row must stay removed.');
assertNotIncludes('src/features/profile/ProfileMobilePage.tsx', 'useMyPromotions', 'profile page must not fetch promotion shortcuts.');
assertIncludes('src/features/feed/PostFeedList.tsx', 'post-feed-list-panel', 'shared post feed list component is required.');
assertIncludes('src/features/feed/PostFeedList.tsx', "@/features/post/PostCard", 'shared post feed list must import the single PostCard implementation directly.');
assertNotIncludes('src/features/feed/PostFeedList.tsx', 'XPostCard', 'PostFeedList must not use the removed XPostCard compatibility alias.');
assertNotIncludes('src/features/feed/DouyinFeed.tsx', 'XPostCard', 'mobile home feed must not import the removed XPostCard compatibility alias.');
assertIncludes('src/features/feed/FeedViewport.tsx', '<LazyPostFeedList', 'mobile home feed must use the lazily loaded shared post feed list.');
assertIncludes('src/features/home/HomeFeedContent.tsx', '<FeedViewport', 'desktop home feed must use the shared feed viewport.');
assertNotIncludes('src/features/home/HomeFeedContent.tsx', 'HomeDesktopFeedSuspenseFallback', 'home feed must not restore a desktop-only suspense fallback.');
assertNotIncludes('src/features/home/HomeFeedSkeletons.tsx', 'home-desktop-feed-shell', 'desktop home skeleton must not add a second feed width shell.');
assertNotIncludes('src/styles/features/home-feed-foundation.css', 'home-desktop-feed-shell', 'home feed CSS must not restore the old skeleton width shell.');
assertNotIncludes('src/styles/features/home-topic-tabs.css', 'home-desktop-feed-shell', 'home feed CSS must not restore the old skeleton width shell.');
assertNotIncludes('src/styles/features/home-topic-tabs-shell.css', 'home-desktop-feed-shell', 'home feed CSS must not restore the old skeleton width shell.');
assertNotIncludes('src/styles/features/home-structured-filters.css', 'home-desktop-feed-shell', 'home feed CSS must not restore the old skeleton width shell.');
assertIncludes('src/pages/CategoryFeedMobile.tsx', '<LazyPostFeedList', 'category feed must use the lazily loaded shared post feed list.');
assertIncludes('src/pages/UserSpace.tsx', '<LazyPostFeedList', 'user-space feed must use the lazily loaded shared post feed list.');
assertIncludes('src/features/profile/profilePageSections.tsx', '<LazyPostFeedList', 'profile post tabs must use the lazily loaded shared post feed list.');
assertIncludes('src/features/profile/profilePageSections.tsx', 'profile-relation-list-shell', 'profile relation lists must use their own shell instead of the post feed shell.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', '<PageHeader\n        title=""\n        showBack={false}\n        titleAlign="center"', 'profile page topbar must reserve chrome without rendering the 我的 title.');
assertNotIncludes('src/features/profile/ProfileMobilePage.tsx', 'title={user.displayName || "我的"}', 'profile topbar must not use the nickname as the page title.');
assertIncludes('src/features/profile/profilePageSections.tsx', '<div className="profile-avatar-stack">', 'profile nickname must live in the avatar stack.');
assertIncludes('src/features/profile/profilePageSections.tsx', 'className="profile-edit-home-button pressable"', 'profile edit-home action must live beside the nickname as an icon.');
assertIncludes('src/pages/UserSpace.tsx', '<div className="profile-avatar-stack user-space-avatar-stack">', 'user-space nickname must live in the shared avatar stack.');
assertNotIncludes('src/pages/UserSpace.tsx', 'title={userName}', 'user-space topbar must not use the nickname as the page title.');
assertIncludes('src/pages/UserSpace.tsx', '<PageHeader title="个人空间" titleAlign="center"', 'user-space topbar title must stay centered.');
assertIncludes('src/styles/features/profile-shared-avatar.css', ':is(.profile-modern-page, .user-space-page-next) :is(.profile-avatar-stack, .user-space-avatar-stack)', 'shared profile header must define the avatar nickname stack.');
assertIncludes('src/styles/00-profile-tokens.css', '--ui-profile-stats-avatar-align-offset: calc((var(--ui-profile-avatar-size) - var(--ui-profile-action-height)) / 2);', 'profile stats must align to the avatar center through shared tokens.');
assertIncludes('src/styles/features/profile-shared-stats.css', 'margin: var(--ui-profile-stats-avatar-align-offset) 0 0;', 'profile stats row must align with avatar height instead of the avatar-plus-name stack.');
assertNotIncludes('src/styles/features/profile-shared-bio.css', ':is(.profile-modern-page, .user-space-page-next) :is(.profile-name-mobile, .profile-name-desktop, .user-space-name-mobile, .user-space-name-desktop) {\n    display: none;', 'profile and user-space nicknames must not be hidden.');
assertCssRuleIncludes(
  'src/styles/features/profile-shared-bio.css',
  ':is(.profile-modern-page, .user-space-page-next) :is(.profile-name-mobile, .profile-name-desktop, .user-space-name-mobile, .user-space-name-desktop)',
  ['width: auto;', 'max-width: none;', 'overflow: visible;', 'text-overflow: clip;', 'white-space: nowrap;', 'overflow-wrap: normal;'],
  'profile and user-space nicknames must render fully beside the edit icon.',
);
assertCssRuleIncludes(
  'src/styles/features/profile-shared-bio.css',
  ':is(.profile-modern-page, .user-space-page-next) .profile-name-row',
  ['display: inline-flex;', 'gap: var(--ui-space-1);', 'overflow-x: auto;'],
  'profile edit-home icon must align beside the nickname through the shared profile header contract.',
);
assertIncludes('src/features/home/HomeTopicTabs.tsx', "'--home-topic-tab-count': Math.max(items.length, 1)", 'home topic tabs must expose their dynamic count to the equal-grid contract.');
assertIncludes('src/features/home/homeStructuredFilterUtils.ts', 'sortHomeStructuredFilterFields', 'home structured filters must order location fields first.');
assertIncludes('src/styles/00-product-tokens.css', '--ui-layer-panel-close-surface: transparent;', 'layer panel close actions must render as a plain X without a default button shell.');
assertIncludes('src/styles/02-core-sheets-actions.css', 'margin-inline-end: var(--ui-layer-panel-close-offset-inline-end);', 'layer panel close actions must use the shared alignment offset.');
assertIncludes('src/features/auth/AuthModal.tsx', 'className="ui-auth-brand-lockup"', 'auth modal brand and slogan must use the stacked brand contract.');
assertIncludes('src/styles/system/ui-primitives-auth.css', '.ui-auth-brand-lockup', 'auth brand lockup style contract is required.');
assertNotIncludes('src/features/auth/AuthModal.tsx', 'ui-auth-brand-divider', 'auth modal brand and slogan must not be split by an inline divider.');
assertIncludes('server/chat/chat.repository.ts', 'normalizeRobotUserId', 'chat bot user spaces must normalize away legacy profile ids before writes.');
assertIncludes('server/chat/chat.repository.ts', "NOT: { id: { startsWith: 'chat-bot-profile-' } }", 'chat bot user spaces must not list the legacy profile-id namespace.');
assertIncludes('server/chat/chat.repository.ts', 'authorType: \'BOT\', authorUserId', 'bot chat messages must store the same UUID user-space id.');
assertIncludes('server/chat/chat.repository.ts', 'userType: \'ROBOT\'', 'created and updated chat bot profiles must materialize ROBOT user spaces.');
assertIncludes('src/features/profile/ProfileSecuritySheet.tsx', 'createPortal(sheet, root)', 'profile security sheet must render through a body-level portal.');
assertIncludes('src/features/profile/ProfileSecuritySheet.tsx', 'className="account-info-avatar-action pressable ui-avatar-action', 'profile security sheet avatar action must use its own portal-safe size contract.');
assertIncludes('src/features/profile/ProfileSecuritySheet.tsx', 'className="account-info-avatar-image relative z-0"', 'profile security sheet avatar image must use its own portal-safe size contract.');
assertCssRuleIncludes(
  'src/styles/features/profile-security-content.css',
  '.profile-security-overlay .account-info-avatar-action,\n  .profile-security-overlay .account-info-avatar-image,\n  .profile-security-overlay .account-info-avatar-action :is(.ui-avatar, .ui-avatar-fallback, .optimized-image, img)',
  ['width: var(--ui-profile-user-list-avatar-size);', 'max-height: var(--ui-profile-user-list-avatar-size);'],
  'profile security sheet avatar must not depend on profile page scoped avatar sizing.',
);
assertIncludes('src/features/profile/ProfileMobilePage.tsx', 'labelDisplay="full"', 'profile tabs must render labels in full instead of truncating them.');
assertIncludes('src/ui/SegmentTabs.tsx', "labelDisplay?: 'truncate' | 'full';", 'segment tabs must expose an explicit label display contract.');
assertIncludes('src/ui/SegmentTabs.tsx', 'ui-segment-tab-label--full', 'segment tabs must support non-truncated labels.');
assertCssRuleIncludes(
  'src/styles/features/profile-tabs.css',
  '.profile-modern-page :is(.profile-tabbar, .ui-segment-tabs)',
  ['background: var(--ui-topbar-surface-standard);'],
  'profile tabs must render the shared solid page chrome surface.',
);
assertCssRuleIncludes(
  'src/styles/features/profile-tabs.css',
  ".profile-modern-page .profile-tabbar .ui-segment-tab[aria-selected='true'],\n  .profile-modern-page .profile-tabbar .ui-segment-tab[data-active='true']",
  ['background: var(--ui-surface-transparent);', 'box-shadow: var(--ui-shadow-none);', 'filter: var(--ui-filter-none);'],
  'profile selected tabs must not render a raised selected fill or shadow.',
);
assertNotIncludes('src/features/profile/ProfileMobilePage.tsx', 'profile-post-list', 'profile feed must not use a page-specific post list wrapper.');
assertNotIncludes('src/features/profile/ProfileMobilePage.tsx', 'profile-list-section--post-feed', 'profile feed must not use page-specific feed geometry.');
assertNotIncludes('src/features/profile/ProfileMobilePage.tsx', 'profile-tab-skeleton-list--feed', 'profile tab loading must not use feed skeleton wrappers.');
assertNotIncludes('src/styles/features/profile-modern.css', 'profile-list-section--post-feed', 'profile CSS must not override post feed geometry.');
assertNotIncludes('src/styles/features/profile-modern.css', 'padding-inline: var(--ui-social-feed-list-padding-x);', 'profile CSS must not double-pad post feed geometry.');
assertNotIncludes('src/styles/features/profile-modern.css', '.profile-modern-page .profile-modern-topbar.nav-blur', 'profile page must not own topbar chrome.');
assertNotIncludes('src/styles/system/ui-sticky-layer-contract.css', 'profile-modern-topbar.nav-blur', 'shared sticky layer contract must not restore profile-only transparent topbar chrome.');
assertNotIncludes('src/styles/system/ui-sticky-layer-contract.css', '--ui-topbar-surface-standard: var(--ui-color-transparent);', 'profile and user-space pages must not force shared topbars transparent.');
assertNotIncludes('src/styles/features/profile-topbar-surface.css', '--ui-topbar-surface-standard:', 'profile and user-space topbar token file must not override the shared topbar surface.');
assertNotIncludes('src/styles/features/profile-modern.css', '.profile-modern-page .profile-tabs-section {\n  position: sticky;', 'profile tabs must not own sticky chrome geometry.');
assertIncludes('src/styles/features/profile-tabs.css', '.profile-modern-page .ui-segment-tab-label--full {\n    overflow: visible;\n    text-overflow: clip;\n    white-space: nowrap;', 'profile tab labels must not be clipped or ellipsized.');
assertNotIncludes('src/pages/CategoryFeedMobile.tsx', 'category-feed-list', 'category feed must not use a page-specific post list class.');
assertNotIncludes('src/styles/features/category-feed.css', 'category-feed-list', 'category feed CSS must not own post list geometry.');
assertNotIncludes('src/styles/features/category-feed.css', 'margin-inline: calc(50% - 50vw)', 'category feed must not use viewport escape geometry.');
assertNotIncludes('src/pages/UserSpace.tsx', 'user-space-post-list-mobile', 'user-space feed must not use old mobile post list geometry.');
assertNotIncludes('src/pages/UserSpace.tsx', 'user-space-post-list-desktop', 'user-space feed must not use old desktop post list geometry.');
assertNotIncludes('src/styles/features/user-space-next.css', 'user-space-post-list-mobile', 'user-space CSS must not own post list mobile geometry.');
assertNotIncludes('src/styles/features/user-space-next.css', 'user-space-post-list-desktop', 'user-space CSS must not own post list desktop geometry.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'sponsor-workbench', 'sponsor center must render as a workbench.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'ui-page-tabs-section ui-layer-sticky-tab', 'sponsor center records must render through the shared sticky tabs.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '效果分析', 'sponsor record tabs must expose the promotion effect analysis tab.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '交易记录', 'sponsor ledger tab must be labeled as transaction records.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'LazyPromotionEffectStatsRow', 'sponsor promotion records must show the shared promotion effect metrics row without bundling inactive sponsor tabs.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'getMyPromotionEffects', 'sponsor effect analysis tab must fetch date-filtered promotion effects.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'SPONSOR_EFFECT_PREVIEW_DAYS = 5', 'sponsor effect analysis preview must only show five recent days.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '查看更多效果分析', 'sponsor effect analysis preview must link to the full history page.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '<LazyLedgerRecordCard', 'sponsor transaction previews must use the shared full-page ledger card without bundling inactive sponsor tabs.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '<LazyPromotionRecordCard', 'sponsor promotion previews must use the shared full-page promotion card without bundling inactive sponsor tabs.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'sponsor-effect-filter', 'sponsor effect analysis preview must not expose date filters.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', '每日汇总', 'sponsor effect analysis preview must not render redundant daily summary copy.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'sponsor-preview-row', 'sponsor preview records must not restore a bespoke row structure.');
assertIncludes('src/app/AppShell.tsx', 'path={APP_ROUTES.promotionEffects}', 'promotion effect history route must stay registered.');
assertIncludes('src/pages/PromotionEffectsHistory.tsx', 'promotion-effects-date-trigger', 'promotion effect history must keep a compact topbar date trigger.');
assertIncludes('src/pages/PromotionEffectsHistory.tsx', 'promotion-effects-date-panel', 'promotion effect history must keep full date controls outside the topbar.');
assertNotIncludes('src/pages/PromotionEffectsHistory.tsx', '每日汇总', 'promotion effect history must not render redundant daily summary copy.');
assertIncludes('src/types.ts', 'dailyItems: PromotionEffectDailyItem[];', 'promotion effect analysis must expose daily metrics.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', '积分明细', 'sponsor page must not use the old points detail wording.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'getMyPromotions', 'sponsor center must preview promotion records in the record tabs.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'sponsor-balance-card', 'sponsor center must not use the old balance card.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'sponsor-panel', 'sponsor center must not use the old panel card.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'sponsor-quick-link', 'sponsor center must not restore standalone record shortcut buttons.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'sponsor-ledger-section', 'sponsor center records must use the tabbed record section.');
assertIncludes('src/styles/components/segment-tabs.css', ".ui-page-tabs-bar.ui-segment-tabs[data-segment-variant='underline']", 'sponsor record tabs must render through the shared underline tab contract, not pill buttons.');
assertIncludes('src/styles/components/segment-tabs.css', ".ui-page-tabs-bar .ui-segment-tab[aria-selected='true']::after", 'sponsor record active tab must render an underline indicator.');
assertIncludes('src/styles/system/record-card-contract.css', '.promotion-effect-stats', 'promotion effect metrics must share one record stats row style.');
assertNotIncludes('src/styles/features/sponsor.css', 'sponsor-balance-card', 'old sponsor card selector must not return.');
assertNotIncludes('src/styles/features/sponsor.css', 'border-radius: var(--ui-radius-pill);\n    background: color-mix(in srgb, var(--ui-color-white) 42%, transparent);', 'sponsor record tabs must not restore the old pill segmented control.');
assertNotIncludes('src/styles/features/sponsor.css', 'sponsor-panel', 'old sponsor panel selector must not return.');
assertNotIncludes('src/styles/features/sponsor.css', 'sponsor-quick-link', 'old sponsor shortcut selector must not return.');
assertNotIncludes('src/styles/features/sponsor.css', 'sponsor-ledger-section', 'old sponsor ledger-only selector must not return.');
assertIncludes('src/features/post/AnchoredActionMenuPanel.tsx', 'style={{ ...initialSurfaceStyle, ...surfaceStyle }}', 'feed card option action sheets must render immediately with stable trigger-derived geometry.');
assertNotIncludes('src/features/post/PostCard.tsx', 'avatarPopoverStyle', 'feed card avatar popovers must not return after removing avatar plus.');
assertIncludes('src/features/home/onlinePresence.ts', 'formatOptionalOnlineCount', 'online count display must use a shared formatter that never coerces null to 0.');
assertNotIncludes('src/features/home/HomeChrome.tsx', 'Number(onlineCount)', 'home online count must not coerce null into 0.');
assertIncludes('src/features/home/HomeChrome.tsx', 'formatOptionalOnlineCount(onlineCount)', 'home online count must use the shared optional formatter.');
assertIncludes('src/features/home/OnlinePresenceContext.tsx', 'OnlinePresenceProvider', 'online count must expose one shared app-level presence provider.');
assertIncludes('src/app/AppShell.tsx', 'min: onlineConfig?.online_users_min', 'desktop context rail online count must use the same configured min as home topbar.');
assertIncludes('src/app/AppShell.tsx', 'max: onlineConfig?.online_users_max', 'desktop context rail online count must use the same configured max as home topbar.');
assertIncludes('src/pages/Home.tsx', 'useOnlinePresence()', 'home topbar online count must consume the shared app-level presence value.');
assertNotIncludes('src/pages/Home.tsx', 'useHomeOnlineCount({', 'home page must not generate a second independent online count.');
assertNotIncludes('src/features/home/HomeChrome.tsx', 'home-topbar-online-', 'home must use the shared topbar online badge.');
assertNotIncludes('src/styles/components/topbar-system.css', 'home-topbar-online-', 'home must not own topbar online badge styling.');
assertIncludes('src/features/home/HomeTopbar.tsx', 'titleNode={skeletonAvatar ? <></> : <HomeBrandLockup />}', 'home brand must render in the centered title lane only outside loading skeletons.');
assertIncludes('src/features/home/HomeTopbar.tsx', 'titleAlign="center"', 'home brand must stay centered in the primary topbar.');
assertNotIncludes('src/features/home/HomeTopbar.tsx', 'left={<HomeBrandLockup />}', 'home brand must not return to the left topbar lane.');
assertIncludes('src/ui/TopbarActions.tsx', 'ui-topbar-online-badge', 'topbar online badge must be a shared topbar action component.');
assertNotIncludes('src/styles/system/ui-foundation-clean.css', 'box-shadow: var(--ui-floating-tabbar-shadow)', 'floating tabbar must not apply an outer shadow.');
assertIncludes('src/styles/system/ui-foundation-clean.css', 'border: var(--ui-border-width-hairline) solid var(--ui-floating-tabbar-border);', 'floating tabbar must render a subtle outline from the shared token.');
assertIncludes('src/app/AppBottomNavigation.tsx', 'TrendingUp', 'bottom navigation promotion entry must use a promotion/exposure icon.');
assertNotIncludes('src/app/AppBottomNavigation.tsx', '<HandCoins className="app-bottom-nav-icon" />', 'bottom navigation promotion entry must not use the old wallet/sponsor icon.');
assertNotIncludes('src/features/admin/adminChrome.tsx', 'bg-[#', 'admin chrome must use semantic classes instead of raw color utilities.');
assertNotIncludes('src/features/admin/adminChrome.tsx', 'tracking-[', 'admin chrome must use admin typography tokens.');
assertNotIncludes('src/features/admin/adminChrome.tsx', 'admin-mobile-user', 'admin chrome must not render the removed mobile account block.');
assertNotIncludes('src/features/admin/adminChrome.tsx', 'admin-sidebar-account', 'admin chrome must not render the removed sidebar account block.');
assertIncludes('src/features/admin/AdminDesktopDataTable.tsx', 'className="w-full text-left table whitespace-nowrap"', 'admin data lists must always use the unified table view.');
assertNotIncludes('src/features/admin/AdminPage.tsx', 'hidden lg:table', 'admin data lists must not switch between mobile cards and desktop tables.');
assertIncludes('src/features/admin/AdminPage.tsx', 'className="admin-console-page"', 'admin page root must use the shared admin shell contract.');
assertIncludes('src/features/admin/AdminPage.tsx', 'className="admin-console-layout"', 'admin page layout must use the shared admin shell contract.');
assertIncludes('src/features/admin/AdminPage.tsx', 'className="admin-console-main"', 'admin page main spacing must be owned by admin CSS.');
assertIncludes('src/styles/features/admin/admin-shell.css', '.admin-console-main {\n    min-width: 0;\n    flex: 1 1 auto;', 'admin console main layout must be owned by admin CSS.');
assertIncludes('src/styles/tokens/feature-contracts.css', '--ui-admin-console-main-padding-x-mobile:', 'admin console spacing must use semantic admin tokens.');
assertNotIncludes('src/features/admin/AdminPage.tsx', 'min-h-screen w-full', 'admin page root must not hard-code viewport and width utilities.');
assertNotIncludes('src/features/admin/AdminPage.tsx', 'min-w-0 flex-1 px-2 py-3 sm:px-4 lg:px-5 lg:py-4 xl:px-6 2xl:px-8', 'admin page main spacing must not live in component utility classes.');
assertIncludes('src/features/admin/AdminDesktopDataTable.tsx', 'admin-dialog-overlay admin-modal-scrim-soft', 'admin promotion edit dialog overlay must reuse the shared admin dialog contract.');
assertIncludes('src/features/admin/AdminDesktopDataTable.tsx', 'admin-editor-field-stack', 'admin promotion edit dialog fields must use semantic admin editor layout.');
assertIncludes('src/features/admin/AdminDesktopDataTable.tsx', 'admin-editor-action-grid', 'admin promotion edit dialog actions must use semantic admin editor layout.');
assertNotIncludes('src/features/admin/AdminDesktopDataTable.tsx', 'fixed inset-0 z-50 flex items-center justify-center admin-modal-scrim-soft p-4', 'admin promotion edit dialog must not hard-code overlay layout utilities.');
assertIncludes('src/features/admin/AdminMobileDataList.tsx', 'className="admin-mobile-overlay"', 'admin mobile edit overlay must use the admin overlay contract.');
assertIncludes('src/features/admin/AdminTableHeader.tsx', '<th className={headerCellClass}>Source</th>', 'admin content table must expose post source.');
assertIncludes('src/features/admin/AdminMobileDataList.tsx', 'Source：{item.source ||', 'admin mobile content records must expose post source.');
assertIncludes('src/features/admin/AdminDesktopDataTable.tsx', 'admin-table-meta--mono admin-table-meta--break">{item.source ||', 'admin desktop content records must expose post source.');
assertIncludes('src/styles/features/admin/admin-filters-responsive.css', 'grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));', 'admin filters must use one responsive grid rule across modules.');
assertIncludes('src/styles/features/admin/admin-filters-responsive.css', '.admin-mobile-list {\n    display: none;', 'admin mobile card lists must stay disabled so all admin query lists share one table surface.');
assertIncludes('src/styles/features/admin/admin-filters-responsive.css', '.admin-mobile-message-card {', 'admin mobile message card styles must be owned by admin.css.');
assertIncludes('src/features/admin/AdminAutoCrawlPanel.tsx', 'admin-dialog-overlay admin-modal-scrim', 'admin auto-crawl source dialog overlay must use the shared admin dialog contract.');
assertIncludes('src/features/admin/AdminAutoCrawlPanel.tsx', 'admin-dialog-panel admin-dialog-panel--wide', 'admin auto-crawl source dialog panel sizing must be owned by admin CSS.');
assertNotIncludes('src/features/admin/AdminAutoCrawlPanel.tsx', 'max-h-[88vh]', 'admin source dialog must not hard-code viewport height in component utility classes.');
assertNotIncludes('src/features/admin/AdminAutoCrawlPanel.tsx', 'max-w-4xl', 'admin source dialog must not hard-code panel width in component utility classes.');
assertIncludes('src/styles/tokens/feature-contracts.css', '--ui-admin-dialog-panel-max-height: min(calc(var(--ui-visual-viewport-height)', 'admin dialog max-height must derive from the shared visual viewport contract.');
assertIncludes('src/styles/features/admin/admin-primitives.css', '.admin-dialog-panel {\n    width: 100%;\n    max-height: var(--ui-admin-dialog-panel-max-height);', 'admin dialog panels must consume the shared panel max-height token.');
assertNotIncludes('src/features/admin/AdminPage.tsx', 'lg:hidden divide-y divide-gray-50 bg-white pt-2', 'admin mobile list must not return to local utility shell styling.');
assertNotIncludes('src/features/admin/AdminPage.tsx', 'key={item.id} className="p-4"', 'admin mobile list items must not return to local padding-only cards.');
assertIncludes('src/features/admin/AdminOpsReportPanel.tsx', 'className="admin-report-metric-card"', 'admin report metric cards must use semantic admin report styling.');
assertIncludes('src/features/admin/AdminOpsReportPanel.tsx', 'className={`admin-report-trend-filter', 'admin report trend filters must use semantic admin report styling.');
assertIncludes('src/features/admin/AdminOpsReportPanel.tsx', 'stroke="var(--ui-text-strong)"', 'admin report chart line must consume semantic text color.');
assertIncludes('src/styles/features/admin/admin-workflows.css', '.admin-report-metric-card {', 'admin report metric card styles must be owned by admin.css.');
assertIncludes('src/styles/features/admin/admin-workflows.css', '.admin-report-delta[data-tone=', 'admin report trend delta tones must be owned by admin.css.');
assertNotIncludes('src/features/admin/AdminPage.tsx', 'stroke="#111827"', 'admin report chart must not hard-code ink colors.');
assertNotIncludes('src/features/admin/AdminPage.tsx', 'fill="#111827"', 'admin report chart points must not hard-code ink colors.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'const SPONSOR_PREVIEW_LIMIT = 4;', 'sponsor workbench record tabs must preview at most four records.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'hasMoreLedgerRecords ? <RecordMoreLink', 'sponsor transaction more link must render only when more records exist.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'hasMorePromotionGroups ? <RecordMoreLink', 'sponsor promotion more link must render only when more records exist.');

const bottomNavSource = readRel('src/app/AppBottomNavigation.tsx');
const bottomNavOrder = [
  'app-bottom-nav-label">首页',
  'app-bottom-nav-label">消息',
  'app-bottom-nav-label">发推',
  'app-bottom-nav-label">买曝光',
  'app-bottom-nav-label">我的',
];
assertNotIncludes('src/app/AppBottomNavigation.tsx', 'app-bottom-nav-label">聊天', 'bottom navigation must use messages instead of the removed chat entry.');
assertNotIncludes('src/app/AppBottomNavigation.tsx', 'app-bottom-nav-label">金主', 'bottom navigation must use the promotion label instead of the old sponsor wording.');
let lastBottomNavIndex = -1;
for (const label of bottomNavOrder) {
  const index = bottomNavSource.indexOf(label);
  if (index <= lastBottomNavIndex) {
    violations.push('src/app/AppBottomNavigation.tsx: bottom nav order must be 首页、消息、发推、买曝光、我的.');
    break;
  }
  lastBottomNavIndex = index;
}

if (violations.length > 0) {
  const relaxed = process.env.UI_HARDCODING_RELAXED === '1';
  const label = relaxed ? 'warning' : 'failed';
  console.error(`UI contract debt ${label}: ${violations.length} item(s).`);
  console.error(violations.slice(0, 120).join('\n'));
  if (violations.length > 120) {
    console.error(`...and ${violations.length - 120} more`);
  }
  if (!relaxed) process.exit(1);
}

if (hardcodingDebt.length > 0) {
  const relaxed = process.env.UI_HARDCODING_RELAXED === '1';
  const label = relaxed ? 'warning' : 'failed';
  console.error(`UI hardcoding debt ${label}: ${hardcodingDebt.length} item(s).`);
  console.error(hardcodingDebt.slice(0, 120).join('\n'));
  if (hardcodingDebt.length > 120) {
    console.error(`...and ${hardcodingDebt.length - 120} more`);
  }
  if (!relaxed) process.exit(1);
}

console.log('UI hardcoding check passed.');
