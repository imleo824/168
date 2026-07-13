import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedSelectorPropertyOverlapManifests } from './css-selector-overlap-manifest.mjs';
import { allowedRootTokenOverrideManifests } from './css-token-override-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const failures = [];
const expectedIndexImports = [
  '@import "tailwindcss";',
  '@import "./styles/layers/foundation.css";',
  '@import "./styles/layers/system-core.css";',
  '@import "./styles/layers/components.css";',
  '@import "./styles/layers/features.css";',
  '@import "./styles/layers/contracts.css";',
];

const expectedTokenFacadeImports = [
  '@import "./tokens/theme.css";',
  '@import "./tokens/foundation.css";',
  '@import "./tokens/layout-components.css";',
  '@import "./tokens/feature-contracts.css";',
  '@import "./tokens/social-contracts.css";',
];

const expectedSystemCoreImports = [
  '@import "../system/ui-primitives.css";',
  '@import "../system/ui-skeleton-contract.css";',
  '@import "../system/home-mobile-first-paint-contract.css";',
  '@import "../system/feed-scroll-shell.css";',
  '@import "../system/mobile-viewport-contract.css";',
  '@import "../utilities/motion-scroll.css";',
];

const expectedContractsImports = [
  '@import "../utilities/mobile-overlay-stability.css";',
  '@import "../system/secondary-page-shell.css";',
  '@import "../system/ui-post-tag-contract.css";',
  '@import "../system/ui-architecture-contract.css";',
  '@import "../system/ui-control-shape-contract.css";',
  '@import "../system/ui-error-boundary-contract.css";',
  '@import "../system/ui-input-focus-stability-contract.css";',
  '@import "../system/ui-sticky-topbar-contract.css";',
];

const expectedCoreImports = [
  '@import "./02-core-controls.css";',
  '@import "./02-core-surfaces.css";',
  '@import "./02-core-sheets-actions.css";',
];

const expectedSkeletonContractImports = [
  '@import "./ui-skeleton-primitives.css";',
  '@import "./ui-skeleton-home.css";',
  '@import "./ui-skeleton-feed.css";',
  '@import "./ui-skeleton-detail.css";',
  '@import "./ui-skeleton-recharge.css";',
];

const expectedStickyTopbarContractImports = [
  '@import "./ui-sticky-layer-contract.css";',
  '@import "./ui-skeleton-chrome-contract.css";',
  '@import "./ui-topbar-compact-actions-contract.css";',
  '@import "./ui-detail-topbar-identity-contract.css";',
];

const expectedSecondaryTopbarImports = [
  '@import "./secondary-page-topbar-base.css";',
  '@import "./secondary-page-detail-topbar.css";',
];

const expectedHomeFeedImports = [
  '@import "./home-feed-foundation.css";',
  '@import "./home-topic-tabs.css";',
];

const expectedHomeTopicTabsImports = [
  '@import "./home-topic-tabs-shell.css";',
  '@import "./home-structured-filters.css";',
];

const expectedCreatePromotePostImports = [
  '@import "./create-promote-post-editor.css";',
  '@import "./create-promote-post-settings.css";',
  '@import "./create-promote-post-picker.css";',
  '@import "./create-promote-post-details.css";',
];

const expectedChatImports = [
  '@import "./chat-shell.css";',
  '@import "./chat-stream.css";',
  '@import "./chat-messages.css";',
  '@import "./chat-post-preview.css";',
  '@import "./chat-composer.css";',
  '@import "./chat-rules.css";',
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(relativeEntry, predicate) {
  const absoluteEntry = path.join(root, relativeEntry);
  const stat = fs.statSync(absoluteEntry);

  if (stat.isFile()) {
    return predicate(relativeEntry) ? [relativeEntry] : [];
  }

  const files = [];
  for (const name of fs.readdirSync(absoluteEntry)) {
    files.push(...walk(path.join(relativeEntry, name), predicate));
  }
  return files;
}

function normalizeImportTarget(fromFile, rawTarget) {
  if (!rawTarget.startsWith('.')) return null;

  const withExtension = rawTarget.endsWith('.css') ? rawTarget : `${rawTarget}.css`;
  return path.normalize(path.join(path.dirname(fromFile), withExtension));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function importLinesFor(file) {
  return read(file)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('@import'));
}

function assertStableImports(file, expectedImports, message) {
  const actualImports = importLinesFor(file);
  if (actualImports.join('\n') !== expectedImports.join('\n')) {
    failures.push(`${file} ${message}:\n${expectedImports.join('\n')}`);
  }
}

function collectFlatCssRules(file) {
  const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const stack = [];
  let selectorStart = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      const selector = source.slice(selectorStart, index).trim();
      stack.push({ selector, bodyStart: index + 1 });
      selectorStart = index + 1;
      continue;
    }

    if (char !== '}') continue;

    const rule = stack.pop();
    if (!rule) {
      selectorStart = index + 1;
      continue;
    }

    const declarations = source.slice(rule.bodyStart, index);
    if (!declarations.includes('{')) {
      rules.push({
        selector: rule.selector.replace(/\s+/g, ' '),
        declarations,
      });
    }
    selectorStart = index + 1;
  }

  return rules;
}

function declarationProperties(declarations) {
  const props = [];
  for (const line of declarations.split(/;|\r?\n/)) {
    const match = line.match(/^\s*([-\w]+)\s*:/);
    if (match) props.push(match[1]);
  }
  return props;
}

const indexImportLines = read('src/index.css')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('@import'));

if (indexImportLines.join('\n') !== expectedIndexImports.join('\n')) {
  failures.push(
    `src/index.css must keep the stable style layer order:\n${expectedIndexImports.join('\n')}`,
  );
}

const tokenFacadeImportLines = read('src/styles/00-tokens.css')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('@import'));

if (tokenFacadeImportLines.join('\n') !== expectedTokenFacadeImports.join('\n')) {
  failures.push(
    `src/styles/00-tokens.css must remain a stable token facade:\n${expectedTokenFacadeImports.join('\n')}`,
  );
}

const systemCoreImportLines = read('src/styles/layers/system-core.css')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('@import'));

if (systemCoreImportLines.join('\n') !== expectedSystemCoreImports.join('\n')) {
  failures.push(
    `src/styles/layers/system-core.css must keep only foundational runtime contracts:\n${expectedSystemCoreImports.join('\n')}`,
  );
}

const contractsImportLines = read('src/styles/layers/contracts.css')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('@import'));

if (contractsImportLines.join('\n') !== expectedContractsImports.join('\n')) {
  failures.push(
    `src/styles/layers/contracts.css must keep system contracts in their stable order:\n${expectedContractsImports.join('\n')}`,
  );
}

const coreImportLines = read('src/styles/02-core.css')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('@import'));

if (coreImportLines.join('\n') !== expectedCoreImports.join('\n')) {
  failures.push(
    `src/styles/02-core.css must only load owned core modules:\n${expectedCoreImports.join('\n')}`,
  );
}

assertStableImports(
  'src/styles/system/ui-skeleton-contract.css',
  expectedSkeletonContractImports,
  'must stay a focused skeleton facade',
);

assertStableImports(
  'src/styles/system/ui-sticky-topbar-contract.css',
  expectedStickyTopbarContractImports,
  'must stay a focused sticky topbar facade',
);

assertStableImports(
  'src/styles/system/secondary-page-topbar.css',
  expectedSecondaryTopbarImports,
  'must split generic secondary topbar and detail identity contracts',
);

assertStableImports(
  'src/styles/features/home-feed.css',
  expectedHomeFeedImports,
  'must stay a facade for home feed owners',
);

assertStableImports(
  'src/styles/features/home-topic-tabs.css',
  expectedHomeTopicTabsImports,
  'must split tab rail and structured filter owners',
);

assertStableImports(
  'src/styles/features/create-promote-post.css',
  expectedCreatePromotePostImports,
  'must stay a facade for post-create owners',
);

assertStableImports(
  'src/styles/features/chat.css',
  expectedChatImports,
  'must stay a facade for chat owners',
);

const productTokenSource = read('src/styles/00-product-tokens.css');
const indexHtmlSource = read('index.html');
const coreSheetSource = read('src/styles/02-core-sheets-actions.css');
const featureContractTokenSource = read('src/styles/tokens/feature-contracts.css');
const homeStructuredFilterSource = read('src/styles/features/home-structured-filters.css');
const socialTokenSource = read('src/styles/tokens/social-contracts.css');
const postTagContractSource = read('src/styles/system/ui-post-tag-contract.css');
const followButtonSource = read('src/features/social/FollowButton.tsx');
const frontendWorkingRulesSource = read('docs/process/frontend-working-rules.rst');
const feedCardSource = read('src/features/post/PostCard.tsx');
const postDetailSource = [
  read('src/pages/PostDetailLegacy.tsx'),
  read('src/features/post-detail/PostDetailLegacySections.tsx'),
].join('\n');
const feedCardActionsSource = read('src/styles/components/feed-card-actions-layout-v2.css');
const postCreateEditorSource = read('src/styles/features/create-promote-post-editor.css');
const telegramContactActionSource = read('src/styles/components/telegram-contact-action.css');

const requiredCssArchitectureContract = [
  [
    'CSS Architecture Contract',
    'frontend working rules must keep the hard CSS architecture contract.',
  ],
  [
    'No hardcoded styling outside approved token owners.',
    'frontend working rules must ban hardcoded styling outside token owners.',
  ],
  [
    'No override-driven fixes.',
    'frontend working rules must ban cascade override driven fixes.',
  ],
  [
    'No temporary CSS architecture.',
    'frontend working rules must ban temporary CSS architecture.',
  ],
  [
    '``contracts`` owns last-load cross-page invariants only; it must not',
    'frontend working rules must keep contracts from becoming a page patch bucket.',
  ],
  [
    'TS/TSX files must not import CSS directly except ``src/main.tsx`` importing',
    'frontend working rules must keep CSS imports centralized.',
  ],
  [
    'Passing current tests is not enough if the change creates an unguarded',
    'frontend working rules must require architecture enforcement, not just green tests.',
  ],
  [
    'CSS state must be explicit, not inferred from descendant structure.',
    'frontend working rules must forbid descendant-structure CSS state.',
  ],
  [
    'CSS must not use ``:has()`` to detect child markup',
    'frontend working rules must ban CSS :has() structure detection.',
  ],
  [
    'Token overrides and stale selectors must stay accountable.',
    'frontend working rules must require token override and stale selector accountability.',
  ],
  [
    '``scripts/css-selector-overlap-manifest.mjs``',
    'frontend working rules must require selector/property overlap accountability.',
  ],
];

for (const [snippet, message] of requiredCssArchitectureContract) {
  if (!frontendWorkingRulesSource.includes(snippet)) {
    failures.push(`docs/process/frontend-working-rules.rst ${message}`);
  }
}

const requiredProductBrandContract = [
  ['--ui-product-brand: #4F5FD9;', 'product brand must use the muted blue-violet primary.'],
  ['--ui-product-brand-tint: #EEF0FC;', 'product brand tint must be the shared selected/tag surface.'],
  ['--ui-product-brand-shade: #2B3380;', 'product brand shade must be the shared link/tag emphasis text.'],
  ['--ui-product-canvas: #F8F8F7;', 'product canvas must use the warm near-white page background.'],
  ['--ui-product-ink: #1A1A1A;', 'product ink must avoid pure black for body and titles.'],
  ['--ui-product-glass-white-70: rgba(255, 255, 255, 0.7);', 'card glass must use a 70% white surface.'],
  ['--ui-product-glass-filter: blur(20px);', 'card glass must use the shared 20px blur.'],
  ['--ui-link-text: var(--ui-product-brand-shade);', 'links must use the deep brand shade.'],
  ['--ui-surface-card: var(--ui-product-glass-white-70);', 'card surfaces must consume the product glass token.'],
  ['--ui-topbar-surface-standard: var(--ui-surface-card-solid);', 'topbar chrome must stay on the solid page surface.'],
  ['--ui-home-topic-tab-surface-active: var(--ui-brand-soft);', 'active home tabs must use the product tint token.'],
  ['--ui-home-topic-tab-active-text: var(--ui-brand-strong);', 'active home tabs must use the product shade token.'],
  ['--ui-feed-action-surface-hover: transparent;', 'feed actions must not get a tinted default hover surface.'],
  ['--ui-feed-action-sync-color: var(--ui-social-action-muted);', 'telegram sync actions must stay neutral by default.'],
];

for (const [snippet, message] of requiredProductBrandContract) {
  if (!productTokenSource.includes(snippet)) {
    failures.push(`src/styles/00-product-tokens.css ${message}`);
  }
}

const forbiddenProductBrandSnippets = [
  ['--ui-product-coral', 'old coral brand tokens must not return.'],
  ['--ui-product-bluegrey', 'old bluegrey tag tokens must not return.'],
  ['--ui-product-money', 'old green price tag tokens must not return.'],
  ['--ui-brand: var(--ui-product-coral)', 'brand must not point at the old coral token.'],
  ['--ui-ins-link-blue: var(--ui-brand-blue)', 'links must not point at the old default blue token.'],
  ['--ui-topbar-surface-country', 'removed country rank topbar surface token must not return.'],
  ['--ui-feed-action-sync-status-dot:', 'removed feed sync status-dot token must not return.'],
  ['--ui-feed-action-status-dot-size:', 'removed feed sync status-dot token must not return.'],
];

for (const [snippet, message] of forbiddenProductBrandSnippets) {
  if (productTokenSource.includes(snippet)) {
    failures.push(`src/styles/00-product-tokens.css ${message}`);
  }
}

const requiredPostCreatePickerTokens = [
  '--post-create-picker-panel-height:',
  '--post-create-picker-panel-height-svh:',
  '--post-create-picker-panel-height-dvh:',
  '--post-create-picker-panel-max-width:',
  '--post-create-picker-panel-desktop-max-height:',
  '--post-create-picker-panel-desktop-viewport-height:',
  '--post-create-picker-panel-desktop-height:',
];

for (const token of requiredPostCreatePickerTokens) {
  if (featureContractTokenSource.includes(token)) continue;
  failures.push(`src/styles/tokens/feature-contracts.css must define ${token} for the post-create picker geometry contract.`);
}

const requiredPostCreateStateTokens = [
  '--post-create-option-selected-border:',
  '--post-create-option-selected-surface:',
  '--post-create-option-selected-text:',
  '--post-create-option-selected-shadow:',
  '--post-create-option-idle-border:',
  '--post-create-option-idle-surface:',
  '--post-create-option-idle-surface-hover:',
  '--post-create-option-idle-text:',
  '--post-create-meta-card-surface:',
  '--post-create-meta-row-filled-surface:',
  '--post-create-meta-row-error-border:',
  '--post-create-meta-row-error-surface:',
];

for (const token of requiredPostCreateStateTokens) {
  if (featureContractTokenSource.includes(token)) continue;
  failures.push(`src/styles/tokens/feature-contracts.css must define ${token} for the post-create state and meta control contract.`);
}

const requiredProfileAvatarActionTokens = [
  '--ui-profile-avatar-camera-badge-bg:',
  '--ui-profile-avatar-camera-badge-fg:',
  '--ui-profile-avatar-camera-badge-border:',
  '--ui-profile-avatar-camera-badge-size:',
  '--ui-profile-avatar-camera-badge-shadow:',
];

for (const token of requiredProfileAvatarActionTokens) {
  if (featureContractTokenSource.includes(token)) continue;
  failures.push(`src/styles/tokens/feature-contracts.css must define ${token} for the profile avatar camera badge contract.`);
}

const requiredHomeStructuredFilterTokens = [
  '--home-structured-filter-overlay-background:',
  '--home-structured-filter-overlay-filter:',
];

for (const token of requiredHomeStructuredFilterTokens) {
  if (socialTokenSource.includes(token)) continue;
  failures.push(`src/styles/tokens/social-contracts.css must define ${token} for the home structured filter overlay contract.`);
}

for (const [snippet, message] of [
  [
    'background: var(--ui-sheet-overlay-background, var(--ui-overlay-sheet));',
    'src/styles/02-core-sheets-actions.css must expose the bottom sheet overlay background slot.',
  ],
  [
    'backdrop-filter: var(--ui-sheet-overlay-filter, var(--ui-glass-blur-sm));',
    'src/styles/02-core-sheets-actions.css must expose the bottom sheet overlay filter slot.',
  ],
  [
    '-webkit-backdrop-filter: var(--ui-sheet-overlay-filter, var(--ui-glass-blur-sm));',
    'src/styles/02-core-sheets-actions.css must expose the prefixed bottom sheet overlay filter slot.',
  ],
]) {
  if (coreSheetSource.includes(snippet)) continue;
  failures.push(message);
}

if (homeStructuredFilterSource.includes('.ui-sheet-overlay.home-structured-filter-overlay')) {
  failures.push('src/styles/features/home-structured-filters.css must customize sheet overlay through token slots, not a stronger compound selector.');
}

if (homeStructuredFilterSource.includes('background: color-mix(in srgb, var(--ui-color-black) 10%, transparent);')) {
  failures.push('src/styles/features/home-structured-filters.css must consume --home-structured-filter-overlay-background instead of hardcoding the overlay surface.');
}

if (homeStructuredFilterSource.includes('backdrop-filter: none;') || homeStructuredFilterSource.includes('-webkit-backdrop-filter: none;')) {
  failures.push('src/styles/features/home-structured-filters.css must consume --home-structured-filter-overlay-filter through the sheet overlay slot instead of overriding filters directly.');
}

if (socialTokenSource.includes('--ui-ins-like: var(--ui-danger-classic);')) {
  failures.push('src/styles/tokens/social-contracts.css like highlight must use the one product brand color, not red.');
}

if (postTagContractSource.includes('ui-product-bluegrey') || postTagContractSource.includes('ui-product-money')) {
  failures.push('src/styles/system/ui-post-tag-contract.css post tag variants must not restore second accent colors.');
}

if (feedCardSource.includes('ChartNoAxesColumnIncreasing') || feedCardSource.includes('TrendingUp')) {
  failures.push('src/features/post/PostCard.tsx heat action must use the flame-and-kindling heat icon, not old abstract ranking/trend icons.');
}

if (!feedCardSource.includes('FlameKindling')) {
  failures.push('src/features/post/PostCard.tsx heat action must use the flame-and-kindling heat icon.');
}

if (!feedCardSource.includes('feed-action-btn--icon-only feed-action-btn--telegram-sync')) {
  failures.push('src/features/post/PostCard.tsx telegram sync action must keep the icon-only action class.');
}

if (feedCardSource.includes('SendHorizontal') || !feedCardSource.includes('RadioTower')) {
  failures.push('src/features/post/PostCard.tsx telegram sync action must use the neutral channel icon.');
}

if (postDetailSource.includes('Heart,') || postDetailSource.includes('<Heart ')) {
  failures.push('src/pages/PostDetailLegacy.tsx like action must use the thumb icon, not the old heart icon.');
}

if (postDetailSource.includes('ChartNoAxesColumnIncreasing') || postDetailSource.includes('TrendingUp')) {
  failures.push('src/pages/PostDetailLegacy.tsx heat action must use the flame-and-kindling heat icon, not old abstract ranking/trend icons.');
}

if (!postDetailSource.includes('FlameKindling')) {
  failures.push('src/pages/PostDetailLegacy.tsx heat action must use the flame-and-kindling heat icon.');
}

for (const snippet of [
  '.feed-action-btn--icon-only',
  'appearance: none;',
  'background: var(--ui-feed-action-surface);',
]) {
  if (feedCardActionsSource.includes(snippet)) continue;
  failures.push(`src/styles/components/feed-card-actions-layout-v2.css must keep the feed icon-only action contract snippet: ${snippet}`);
}

if (feedCardActionsSource.includes('.feed-action-btn--telegram-sync::after')) {
  failures.push('src/styles/components/feed-card-actions-layout-v2.css telegram sync action must not render a status-dot surface behind the channel icon.');
}

for (const snippet of [
  "--ui-telegram-contact-action-surface-hover: color-mix(in srgb, var(--ui-brand)",
  '--ui-telegram-contact-action-color: var(--ui-brand);',
  '--ui-telegram-contact-action-color-hover: var(--ui-brand);',
]) {
  if (!telegramContactActionSource.includes(snippet)) continue;
  failures.push('src/styles/components/telegram-contact-action.css contact/sync icon actions must stay neutral by default, without brand-blue surfaces or borders.');
}

if (!postCreateEditorSource.includes(".post-create-tool-button[data-tool='telegram'][data-state='on']")) {
  failures.push('src/styles/features/create-promote-post-editor.css must keep a telegram-owned neutral active icon rule.');
}

if (!postCreateEditorSource.includes(".post-create-tool-button[data-tool='telegram']:hover")) {
  failures.push('src/styles/features/create-promote-post-editor.css must keep telegram tool hover neutral instead of inheriting a tinted action surface.');
}

for (const legacyFollowClass of [
  'feed-follow-button-following',
  'feed-follow-button--following',
  'feed-follow-button--new',
]) {
  if (!followButtonSource.includes(legacyFollowClass)) continue;
  failures.push(
    `src/features/social/FollowButton.tsx must expose follow state through data-follow-state, not legacy class ${legacyFollowClass}.`,
  );
}

if (!indexHtmlSource.includes('--initial-surface-page: var(--ui-surface-page, Canvas);')) {
  failures.push('index.html initial page background must defer to the product surface token.');
}

if (!indexHtmlSource.includes('--initial-online-dot: var(--ui-online-dot, color-mix(in srgb, CanvasText 68%, Canvas));')) {
  failures.push('index.html initial online dot must defer to the shared online token.');
}

if (!indexHtmlSource.includes('class="initial-home-topbar home-topbar ui-topbar ui-topbar--home"')) {
  failures.push('index.html initial home skeleton must use the shared home topbar semantic contract.');
}

if (!indexHtmlSource.includes('class="initial-home-topbar-inner ui-topbar-inner ui-topbar-inner--center-title"')) {
  failures.push('index.html initial home skeleton topbar must use the centered PageHeader grid.');
}

if (!indexHtmlSource.includes('class="initial-home-leading-placeholder ui-topbar-leading-placeholder"')) {
  failures.push('index.html initial home skeleton must reserve the same leading lane as HomeTopbar.');
}

if (indexHtmlSource.includes('.initial-home-topbar {\n        display: flex;')) {
  failures.push('index.html initial home skeleton topbar must not use the old left-brand flex layout.');
}

if (indexHtmlSource.includes('<div class="initial-home-brand">TuiTui</div>')) {
  failures.push('index.html initial home skeleton brand must not be a left-lane direct child.');
}

const deletedStyleFiles = [
  [
    'src/styles/02-core-compat.css',
    'Move compatibility rules into ui-foundation-clean.css or the owning component/feature stylesheet instead of restoring a catch-all core file.',
  ],
  [
    'src/styles/system/ui-visual-contract.css',
    'Move visual decisions into product tokens and the owning system/component/feature stylesheet instead of restoring a late catch-all layer.',
  ],
  [
    'src/styles/system/ui-action-surface-strength.css',
    'Action surface tokens and primary/muted button state rules belong to src/styles/system/ui-control-shape-contract.css.',
  ],
  [
    'src/styles/tokens/raw-bridges.css',
    'Raw numbered bridge tokens are retired; use named semantic tokens in src/styles/tokens/social-contracts.css or product tokens.',
  ],
  [
    'src/styles/system/ui-instagram-polish-contract.css',
    'Move page-specific styling into its owning feature stylesheet.',
  ],
  [
    'src/styles/system/ui-auth-feed-polish-contract.css',
    'Move auth rules to ui-primitives-auth.css, media rules to components/media.css, and profile rules to profile-modern.css.',
  ],
  [
    'src/styles/system/ui-polish-corrections-contract.css',
    'Move late corrections into the component or utility owner instead of reintroducing a catch-all layer.',
  ],
  [
    'src/styles/system/ui-post-list-contract.css',
    'Move tag, masonry, story, profile, and topbar rules into their owning component or feature stylesheet.',
  ],
  [
    'src/styles/features/home-polish.css',
    'Home topbar, tabs, and manager rules belong to their named home feature stylesheets.',
  ],
  [
    'src/styles/features/home-foundation.css',
    'Home tabs, manager, country stories, and floating actions must stay in their named home owner stylesheets.',
  ],
  [
    'src/styles/features/home-country-stories.css',
    'Home no longer renders country story DOM; topic tab chrome belongs to src/styles/features/home-topic-tabs-shell.css.',
  ],
  [
    'src/styles/features/create-promote-records-contract.css',
    'Record and promote history header/card rules belong to src/styles/features/promote-history-edit.css and src/styles/system/record-card-contract.css.',
  ],
  [
    'src/styles/components/feed-card-actions.css',
    'Follow button styling belongs to src/styles/components/feed-follow-interaction.css; feed cards must not keep a second follow-button owner.',
  ],
  [
    'src/styles/features/promote-layout-contract.css',
    'Promote booking layout is registered through src/styles/features/promote-layout.css.',
  ],
  [
    'src/styles/system/ui-action-input-final-contract.css',
    'Mobile form sizing belongs to src/styles/system/ui-control-shape-contract.css.',
  ],
  [
    'src/styles/system/ui-page-alignment-final-contract.css',
    'Page alignment rules belong to skeleton, profile, and post-create owners.',
  ],
  [
    'src/styles/system/ui-home-recharge-contract.css',
    'Home chrome belongs to home/topbar owners and recharge rules belong to src/styles/features/recharge.css.',
  ],
  [
    'src/styles/system/ui-profile-create-badge-contract.css',
    'Profile avatar create badge styling belongs to the profile owner stylesheet.',
  ],
  [
    'src/styles/system/ui-home-country-ring-contract.css',
    'Home country story ring rules belong to src/styles/features/home-feed.css.',
  ],
  [
    'src/styles/system/profile-header-contract.css',
    'Profile and user-space header rules belong to src/styles/features/profile-shared-header.css.',
  ],
  [
    'src/styles/system/profile-avatar-action.css',
    'Profile avatar action rules belong to src/styles/features/profile-avatar-action.css.',
  ],
  [
    'src/styles/system/profile-security-sheet.css',
    'Profile account sheet rules belong to src/styles/features/profile-security-sheet.css.',
  ],
  [
    'src/styles/system/ui-detail-topbar-action-contract.css',
    'Detail topbar action state rules belong to src/styles/features/post-detail.css.',
  ],
  [
    'src/styles/features/post-detail-foundation.css',
    'Post detail shell, topbar, and bottom actions belong to src/styles/features/post-detail.css.',
  ],
  [
    'src/styles/system/ui-skeleton-avatar-contract.css',
    'Feed skeleton avatar presentation belongs to src/styles/components/feed-card-shell.css.',
  ],
  [
    'src/styles/system/ui-telegram-contact-action.css',
    'Telegram contact action visuals belong to src/styles/components/telegram-contact-action.css.',
  ],
  [
    'src/styles/system/ui-post-create-topbar-contract.css',
    'Post create submit bar rules belong to src/styles/features/create-promote-submit.css.',
  ],
  [
    'src/styles/system/home-scroll-top-action.css',
    'Home floating quick actions belong to src/styles/features/home-floating-actions.css.',
  ],
  [
    'src/styles/system/ui-post-contact-placement.css',
    'Contact placement rules belong to their page owners: post-detail.css and user-space-next.css.',
  ],
];

for (const [file, guidance] of deletedStyleFiles) {
  if (fs.existsSync(path.join(root, file))) {
    failures.push(`${file} must stay deleted. ${guidance}`);
  }
}

for (const file of walk('src', (entry) => /\.(tsx|ts|css)$/.test(entry))) {
  const source = read(file);
  for (const staleHomeStorySnippet of [
    'home-country-stories-shell',
    'home-country-stories-inner',
    'home-country-story-',
    'home-has-country-stories',
    'country-story-',
    'country-heat-progress',
    'ui-country-story-',
    'ui-story-ring-',
    'ui-ins-story-ring',
    'ui-create-mark-',
    'ui-home-create-mark-',
  ]) {
    if (!source.includes(staleHomeStorySnippet)) continue;
    failures.push(`${file} must not restore stale Home country-story CSS/DOM contract "${staleHomeStorySnippet}". Use home-topic-tabs-* owners instead.`);
  }
}

const legacyBaseAliases = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--component-radius-xs',
  '--component-radius-sm',
  '--component-radius-md',
  '--component-radius-card',
  '--component-radius-panel',
  '--component-radius-sheet',
  '--component-radius-media',
  '--component-radius-pill',
  '--radius-xs',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-xl',
  '--radius-media',
  '--brand',
  '--brand-hover',
  '--success',
  '--warning',
  '--danger',
  '--surface',
  '--surface-muted',
  '--surface-weak',
  '--surface-raised',
  '--surface-soft',
  '--surface-elevated',
  '--line-soft',
  '--line-strong',
  '--line-focus',
  '--state-hover',
  '--state-pressed',
  '--state-selected',
  '--text-strong',
  '--text-muted',
  '--text-secondary',
  '--text-subtle',
  '--text-soft',
  '--font-body-weight',
  '--font-medium-weight',
  '--font-strong-weight',
  '--font-title-weight',
  '--font-display-weight',
  '--font-normal-weight',
  '--line-height-base',
  '--line-height-tight',
  '--x-body-size',
  '--x-meta-size',
  '--x-caption-size',
  '--x-title-size',
  '--x-page-title-size',
  '--x-profile-name-size',
  '--x-body-line',
  '--x-body-line-relaxed',
  '--x-gap',
  '--tracking-tight-ui',
  '--tracking-wide-ui',
  '--layout-max',
  '--layout-content-max',
  '--shadow-card',
  '--shadow-card-hover',
  '--shadow-control',
  '--control-height-xs',
  '--control-height-sm',
  '--control-height-md',
  '--control-height-lg',
  '--hit-target-mobile',
  '--hit-target-desktop',
  '--feed-card-padding',
  '--feed-card-gap',
  '--masonry-gap',
  '--sheet-max-width',
  '--brand-media-placeholder',
];

const baseSource = read('src/styles/01-base.css');
for (const alias of legacyBaseAliases) {
  if (baseSource.includes(`${alias}:`)) {
    failures.push(
      `src/styles/01-base.css must not restore legacy alias ${alias}; use the canonical --ui-* token directly.`,
    );
  }
}

const legacyAliasReferencePattern = new RegExp(
  `var\\(\\s*(${legacyBaseAliases.map(escapeRegExp).join('|')})(?=\\s*[,\\)])`,
  'g',
);

for (const file of walk('src', (entry) => /\.(css|tsx?|jsx?)$/.test(entry))) {
  const source = read(file);
  const matches = [...source.matchAll(legacyAliasReferencePattern)].map((match) => match[1]);
  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length > 0) {
    failures.push(
      `${file} must use canonical --ui-* tokens instead of legacy aliases: ${uniqueMatches.join(', ')}`,
    );
  }
}

const deletedComponentFiles = [
  [
    'src/features/feed/XPostCard.tsx',
    'Feed cards must use the single implementation in src/features/post/PostCard.tsx.',
  ],
];

for (const [file, guidance] of deletedComponentFiles) {
  if (fs.existsSync(path.join(root, file))) {
    failures.push(`${file} must stay deleted. ${guidance}`);
  }
}

const allowedRootTokenOverrideKeys = new Set();
for (const manifest of allowedRootTokenOverrideManifests) {
  const files = [...manifest.files].sort();
  const fileSetKey = files.join('|');

  if (files.length < 2 || !manifest.direction || !manifest.reason) {
    failures.push(
      `Root token override manifest for ${fileSetKey || '(missing files)'} must include files, direction, and reason.`,
    );
  }

  for (const token of manifest.tokens || []) {
    if (!token.startsWith('--ui-')) {
      failures.push(`Root token override manifest entry ${token} in ${fileSetKey} must be a --ui-* token.`);
      continue;
    }

    const key = `${token}|${fileSetKey}`;
    if (allowedRootTokenOverrideKeys.has(key)) {
      failures.push(`Root token override manifest duplicates ${token} for ${fileSetKey}.`);
      continue;
    }
    allowedRootTokenOverrideKeys.add(key);
  }
}

const rootTokenDefinitionsByName = new Map();
for (const file of walk('src/styles', (entry) => entry.endsWith('.css'))) {
  for (const rule of collectFlatCssRules(file)) {
    if (!rule.selector.includes(':root')) continue;

    for (const match of rule.declarations.matchAll(/(--ui-[a-zA-Z0-9-_]+)\s*:/g)) {
      const definitions = rootTokenDefinitionsByName.get(match[1]) || [];
      definitions.push({ file, selector: rule.selector });
      rootTokenDefinitionsByName.set(match[1], definitions);
    }
  }
}

const observedRootTokenOverrideKeys = new Set();
for (const [token, definitions] of rootTokenDefinitionsByName.entries()) {
  const files = [...new Set(definitions.map((definition) => definition.file))].sort();
  if (files.length <= 1) continue;

  const fileSetKey = files.join('|');
  const overrideKey = `${token}|${fileSetKey}`;
  if (allowedRootTokenOverrideKeys.has(overrideKey)) {
    observedRootTokenOverrideKeys.add(overrideKey);
    continue;
  }

  failures.push(
    `${token} is defined as a root token in multiple unapproved owners: ${files.join(', ')}. Add a per-token entry to scripts/css-token-override-manifest.mjs with an explicit direction and reason, or move the override into a scoped selector.`,
  );
}

for (const key of allowedRootTokenOverrideKeys) {
  if (observedRootTokenOverrideKeys.has(key)) continue;
  failures.push(
    `Root token override manifest contains stale or incorrect entry ${key}; remove it or update the owning files.`,
  );
}

function selectorOverlapKey(selector, property, files) {
  return `${selector}|||${property}|||${[...files].sort().join('|')}`;
}

const allowedSelectorOverlapKeys = new Set();
for (const manifest of allowedSelectorPropertyOverlapManifests) {
  const files = [...(manifest.files || [])].sort();
  const properties = manifest.properties || (manifest.property ? [manifest.property] : []);
  if (!manifest.selector || files.length < 2 || properties.length < 1 || !manifest.reason) {
    failures.push(
      `Selector overlap manifest for "${manifest.selector || '(missing selector)'}" must include selector, files, property/properties, and reason.`,
    );
    continue;
  }

  for (const property of properties) {
    const key = selectorOverlapKey(manifest.selector, property, files);
    if (allowedSelectorOverlapKeys.has(key)) {
      failures.push(`Selector overlap manifest duplicates ${manifest.selector} ${property} in ${files.join(', ')}.`);
      continue;
    }
    allowedSelectorOverlapKeys.add(key);
  }
}

const selectorPropertyOwners = new Map();
for (const file of walk('src/styles', (entry) => entry.endsWith('.css'))) {
  for (const rule of collectFlatCssRules(file)) {
    if (rule.selector.includes(':root')) continue;

    for (const property of declarationProperties(rule.declarations)) {
      const key = `${rule.selector}|||${property}`;
      const owners = selectorPropertyOwners.get(key) || new Set();
      owners.add(file);
      selectorPropertyOwners.set(key, owners);
    }
  }
}

const observedSelectorOverlapKeys = new Set();
for (const [key, owners] of selectorPropertyOwners.entries()) {
  const files = [...owners].sort();
  if (files.length <= 1) continue;

  const [selector, property] = key.split('|||');
  const overlapKey = selectorOverlapKey(selector, property, files);
  if (allowedSelectorOverlapKeys.has(overlapKey)) {
    observedSelectorOverlapKeys.add(overlapKey);
    continue;
  }

  failures.push(
    `Selector/property overlap "${selector}" ${property} appears in multiple unapproved owners: ${files.join(', ')}. Move the declaration to the true owner or add a reasoned entry to scripts/css-selector-overlap-manifest.mjs.`,
  );
}

for (const key of allowedSelectorOverlapKeys) {
  if (observedSelectorOverlapKeys.has(key)) continue;
  failures.push(
    `Selector overlap manifest contains stale or incorrect entry ${key}; remove it or update the owning files.`,
  );
}

for (const file of walk('src/styles', (entry) => entry.endsWith('.css'))) {
  const source = read(file);
  if (source.includes('[class*=')) {
    failures.push(
      `${file} must not use broad [class*=...] selectors; use explicit semantic classes or data attributes instead.`,
    );
  }
}

for (const rule of collectFlatCssRules('src/styles/system/home-mobile-first-paint-contract.css')) {
  if (rule.selector.startsWith('@')) continue;
  if (rule.selector.includes('.home-')) continue;

  failures.push(
    `src/styles/system/home-mobile-first-paint-contract.css selector "${rule.selector}" must stay scoped to Home-owned classes.`,
  );
}

if (read('src/styles/system/home-mobile-first-paint-contract.css').includes(':has(.home-topic-tabs-sticky-shell)')) {
  failures.push(
    'src/styles/system/home-mobile-first-paint-contract.css must use explicit Home shell state such as .home-has-sticky-topic-tabs instead of :has() composition detection.',
  );
}

if (!read('src/features/home/homeLayout.ts').includes('home-has-sticky-topic-tabs')) {
  failures.push(
    'src/features/home/homeLayout.ts must expose explicit Home shell state for first-paint CSS instead of relying on CSS descendant detection.',
  );
}

for (const file of walk('src/styles', (entry) => entry.endsWith('.css'))) {
  if (!read(file).includes(':has(')) continue;
  failures.push(
    `${file} must not use :has(); expose explicit component state, semantic classes, or data attributes instead of descendant structure detection.`,
  );
}

const selectorOwnershipRules = [
  {
    file: 'src/styles/tokens/foundation.css',
    forbidden: '--ui-font-weight-bold',
    owner: 'canonical typography tokens such as --ui-font-weight-display or --ui-font-weight-strong',
  },
  {
    file: 'src/styles/tokens/foundation.css',
    forbidden: '--ui-text-lg',
    owner: 'canonical typography tokens such as --ui-text-title or --ui-text-xl',
  },
  {
    file: 'src/styles/system/ui-primitives-feedback.css',
    forbidden: '.ui-error-boundary',
    owner: 'src/styles/system/ui-error-boundary-contract.css',
  },
  {
    file: 'src/styles/system/ui-primitives-layout.css',
    forbidden: '.ui-sheet {',
    owner: 'src/styles/02-core-sheets-actions.css',
  },
  {
    file: 'src/styles/system/ui-primitives-layout.css',
    forbidden: '.ui-sheet-overlay {',
    owner: 'src/styles/02-core-sheets-actions.css',
  },
  {
    file: 'src/styles/system/ui-foundation-clean.css',
    forbidden: '.ui-sheet {',
    owner: 'src/styles/02-core-sheets-actions.css',
  },
  {
    file: 'src/styles/system/ui-primitives-responsive.css',
    forbidden: '.ui-sheet-header',
    owner: 'src/styles/02-core-sheets-actions.css',
  },
  {
    file: 'src/styles/system/ui-primitives-responsive.css',
    forbidden: '.ui-sheet-overlay',
    owner: 'src/styles/02-core-sheets-actions.css',
  },
  {
    file: 'src/styles/features/create-promote-keyboard.css',
    forbidden: 'promote-category-chip',
    owner: 'src/styles/features/promote-layout-choices.css',
  },
  {
    file: 'src/styles/features/create-promote-keyboard.css',
    forbidden: 'promote-calendar',
    owner: 'src/styles/features/promote-layout-calendar.css',
  },
  {
    file: 'src/styles/features/create-promote-responsive.css',
    forbidden: 'promote-type-card',
    owner: 'src/styles/features/promote-layout-choices.css',
  },
  {
    file: 'src/styles/features/create-promote.css',
    forbidden: 'create-promote-ads.css',
    owner: 'src/styles/features/promote-layout.css',
  },
  {
    file: 'src/styles/features/create-promote-state.css',
    forbidden: '--post-create-option-selected-border:',
    owner: 'src/styles/tokens/feature-contracts.css post-create state tokens',
  },
  {
    file: 'src/styles/features/create-promote-state.css',
    forbidden: '--post-create-option-idle-border:',
    owner: 'src/styles/tokens/feature-contracts.css post-create state tokens',
  },
  {
    file: 'src/styles/features/create-promote-state.css',
    forbidden: 'post-create-category-meta',
    owner: 'removed legacy category-meta selectors; current owner is post-create-meta-* in src/features/post-create/postCreateComponents.tsx',
  },
  {
    file: 'src/styles/components/bottom-nav.css',
    forbidden: 'app-bottom-nav-count',
    owner: 'removed bottom nav count selector; bottom nav only renders icon/label/badge nodes from App.tsx',
  },
  {
    file: 'src/styles/features/post-detail.css',
    forbidden: 'detail-bottom-action--view',
    owner: 'removed detail view action selector; current bottom actions are heat/like/share/quote/contact',
  },
  {
    file: 'src/styles/features/post-detail.css',
    forbidden: 'detail-quotes-state {',
    owner: 'removed detail quote state wrapper selector; live quote states use detail-quotes-state-block',
  },
  {
    file: 'src/styles/features/create-promote-post-editor.css',
    forbidden: 'post-create-submit-spinner',
    owner: 'removed submit spinner selector; publish busy state no longer emits this class',
  },
  {
    file: 'src/styles/tokens/feature-contracts.css',
    forbidden: '--post-create-submit-spinner-size:',
    owner: 'removed submit spinner selector; do not keep dead spinner geometry tokens',
  },
  {
    file: 'src/styles/features/create-promote-responsive.css',
    forbidden: 'post-create-spin',
    owner: 'removed submit spinner keyframes; do not keep animation endpoints without a consumer',
  },
  {
    file: 'src/styles/features/create-promote-post-picker.css',
    forbidden: 'post-create-picker-clear',
    owner: 'removed post-create picker clear selector; no current TSX emits this class',
  },
  {
    file: 'src/styles/features/create-promote-post-settings.css',
    forbidden: 'post-create-category-clear',
    owner: 'removed post-create category clear selector; no current TSX emits this class',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: 'post-create-category-clear',
    owner: 'removed post-create category clear selector; no current TSX emits this class',
  },
  {
    file: 'src/styles/features/create-promote-post-details.css',
    forbidden: 'post-create-location-option-country',
    owner: 'removed post-create location country sublabel selector; no current TSX emits this class',
  },
  {
    file: 'src/styles/features/create-promote-post-editor.css',
    forbidden: 'post-create-initial-settings',
    owner: 'removed post-create initial settings selector family; current create flow keeps selection labels inside tool button summary classes',
  },
  {
    file: 'src/styles/features/create-promote-post-editor.css',
    forbidden: 'record-header-action',
    owner: 'removed record header action selector; current header controls use HeaderSelectAction and ui-button-header',
  },
  {
    file: 'src/styles/features/create-promote-post-editor.css',
    forbidden: 'promote-header-action',
    owner: 'removed promote header action selector family; current header controls use HeaderSelectAction and ui-button-header',
  },
  {
    file: 'src/styles/features/home-structured-filters.css',
    forbidden: 'home-structured-filter-label',
    owner: 'removed Home structured filter label selector; group labels now come from section aria labels, not visible label nodes',
  },
  {
    file: 'src/styles/features/home-structured-filters.css',
    forbidden: 'home-structured-location-country {',
    owner: 'removed hidden country sublabel selector; live country controls use home-structured-location-country-option',
  },
  {
    file: 'src/styles/components/topbar-system.css',
    forbidden: 'home-topbar-brand-logo',
    owner: 'removed HomeTopbar logo image selectors; current brand lockup renders home-topbar-brand-name syllables only',
  },
  {
    file: 'src/styles/components/topbar-system.css',
    forbidden: '.home-topbar-brand-word',
    owner: 'removed HomeTopbar word fallback selector; current brand lockup renders home-topbar-brand-name syllables only',
  },
  {
    file: 'src/styles/components/topbar-system.css',
    forbidden: 'home-topbar-profile-',
    owner: 'removed HomeTopbar profile button selectors; right slot now renders create action plus online badge',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: 'home-topbar-brand-logo',
    owner: 'removed HomeTopbar logo image selectors; system shape contract must not keep stale exceptions',
  },
  {
    file: 'src/styles/system/ui-topbar-compact-actions-contract.css',
    forbidden: 'home-topbar-profile-button',
    owner: 'removed HomeTopbar profile button selector; compact action contract must not keep stale special cases',
  },
  {
    file: 'src/styles/components/media.css',
    forbidden: 'media-grid-brand-placeholder',
    owner: 'removed media brand placeholder selectors; live media loading state uses media-grid-loading-copy/text from PostMediaGrid',
  },
  {
    file: 'src/styles/components/media.css',
    forbidden: '.media-grid-gap',
    owner: 'removed unused media gap utility; live media shells consume --ui-media-grid-gap directly',
  },
  {
    file: 'src/styles/features/sponsor.css',
    forbidden: 'sponsor-row-order',
    owner: 'removed sponsor row order selector; live rows render sponsor-row-meta plus RecordIdRow',
  },
  {
    file: 'src/styles/00-promote-tokens.css',
    forbidden: '--ui-promote-header-actions-max-width',
    owner: 'removed promote header action selector family; do not keep dead header action geometry tokens',
  },
  {
    file: 'src/styles/00-promote-tokens.css',
    forbidden: '--ui-promote-header-action-max',
    owner: 'removed promote header action selector family; do not keep dead header action geometry tokens',
  },
  {
    file: 'src/styles/01-base.css',
    forbidden: '.text-muted',
    owner: 'removed legacy text-muted alias; use ui-text-muted or UIText tone semantics',
  },
  {
    file: 'src/styles/01-base.css',
    forbidden: '.x-post-body',
    owner: 'removed unused global post body alias; post body typography is owned by feed/detail content selectors',
  },
  {
    file: 'src/styles/01-base.css',
    forbidden: '.ui-brand-btn',
    owner: 'removed legacy brand button alias; use ui-button-primary for primary actions',
  },
  {
    file: 'src/styles/02-core-sheets-actions.css',
    forbidden: '.ui-layer-panel-title-wrap',
    owner: 'removed unused layer panel title wrapper alias; sheet title layout uses ui-sheet-title-wrap',
  },
  {
    file: 'src/styles/02-core-sheets-actions.css',
    forbidden: '.ui-sheet {',
    owner: 'removed unused base sheet wrapper; BottomSheet emits ui-sheet-overlay and ui-sheet-panel',
  },
  {
    file: 'src/styles/02-core-sheets-actions.css',
    forbidden: '.ui-sheet-overlay-category',
    owner: 'removed unused sheet overlay category z-index helper; emitted overlays use concrete overlay classes',
  },
  {
    file: 'src/styles/features/admin.css',
    forbidden: '.tracking-tight',
    owner: 'removed unused admin Tailwind tracking alias; admin tracking normalization only keeps emitted classes',
  },
  {
    file: 'src/styles/features/promote-layout-choices.css',
    forbidden: '.ui-active-caption',
    owner: 'removed unused active caption selector; current promote cards emit ui-active-title only',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: '.ui-brand-btn',
    owner: 'removed legacy brand button alias; control shape contract should target ui-button-primary',
  },
  {
    file: 'src/styles/system/ui-foundation-clean.css',
    forbidden: '.ui-border-medium',
    owner: 'removed unused generic border utility; use emitted semantic border classes or owner tokens',
  },
  {
    file: 'src/styles/system/ui-foundation-clean.css',
    forbidden: '.ui-border-strong',
    owner: 'removed unused generic border utility; use emitted semantic border classes or owner tokens',
  },
  {
    file: 'src/styles/system/ui-foundation-clean.css',
    forbidden: '.ui-hover-bg-hover',
    owner: 'removed unused hover utility; hover behavior belongs to component owners',
  },
  {
    file: 'src/styles/system/ui-foundation-clean.css',
    forbidden: '.ui-hover-text-strong',
    owner: 'removed unused hover utility; hover behavior belongs to component owners',
  },
  {
    file: 'src/styles/system/ui-foundation-clean.css',
    forbidden: '.ui-button-primary',
    owner: 'primary button visuals belong to src/styles/system/ui-control-shape-contract.css',
  },
  {
    file: 'src/styles/system/ui-primitives-auth.css',
    forbidden: '.ui-auth-brand-divider',
    owner: 'removed auth brand divider selector; auth modal brand block no longer emits a divider node',
  },
  {
    file: 'src/styles/system/ui-primitives-layout.css',
    forbidden: '.ui-layer-low-overlay',
    owner: 'removed unused z-index helper; overlays must use emitted semantic layer classes',
  },
  {
    file: 'src/styles/system/ui-primitives-upload.css',
    forbidden: '.ui-active-caption',
    owner: 'removed unused active caption selector; current active upload/promote states use explicit owners',
  },
  {
    file: 'src/styles/components/topbar.css',
    forbidden: 'promote-header-actions',
    owner: 'removed promote header actions wrapper; current header controls use ui-header-actions and record-header-control-wrap',
  },
  {
    file: 'src/styles/components/topbar.css',
    forbidden: 'ui-header-actions',
    owner: 'removed unused header actions wrapper; PageHeader action slot owns current header action layout',
  },
  {
    file: 'src/styles/features/promote-history-edit.css',
    forbidden: 'record-header-action',
    owner: 'removed record header action selector; current header controls use HeaderSelectAction and ui-button-header',
  },
  {
    file: 'src/styles/features/promote-history-edit.css',
    forbidden: 'promote-header-action',
    owner: 'removed promote header action selector family; current header controls use HeaderSelectAction and ui-button-header',
  },
  {
    file: 'src/styles/features/promote-history-edit.css',
    forbidden: 'promote-header-actions',
    owner: 'removed promote header actions wrapper; current header controls use ui-header-actions and record-header-control-wrap',
  },
  {
    file: 'src/styles/features/create-promote-responsive.css',
    forbidden: 'record-header-action',
    owner: 'removed record header action selector; responsive hover contract should target current controls only',
  },
  {
    file: 'src/styles/features/create-promote-responsive.css',
    forbidden: 'promote-header-action',
    owner: 'removed promote header action selector family; responsive hover contract should target current controls only',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: 'record-header-action',
    owner: 'removed record header action selector; system shape contract must not keep stale action exceptions',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: 'promote-header-action',
    owner: 'removed promote header action selector family; system shape contract must not keep stale action exceptions',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: '.ui-status-dot',
    owner: 'removed unused status dot class; status indicators must use emitted semantic classes',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: '--ui-error-boundary-icon-size',
    owner: 'removed unused error boundary icon wrapper token; ErrorBoundary emits ui-error-boundary-icon-svg inside StateBlock',
  },
  {
    file: 'src/styles/system/ui-topbar-compact-actions-contract.css',
    forbidden: 'record-header-action',
    owner: 'removed record header action selector; compact topbar contract must target current semantic controls',
  },
  {
    file: 'src/styles/system/ui-topbar-compact-actions-contract.css',
    forbidden: 'promote-header-action',
    owner: 'removed promote header action selector family; compact topbar contract must target current semantic controls',
  },
  {
    file: 'src/styles/system/ui-topbar-compact-actions-contract.css',
    forbidden: 'promote-header-actions',
    owner: 'removed promote header actions wrapper; compact topbar contract must target current semantic controls',
  },
  {
    file: 'src/styles/system/ui-topbar-compact-actions-contract.css',
    forbidden: 'ui-header-actions',
    owner: 'removed unused header actions wrapper; compact topbar contract must target current PageHeader slots and emitted controls',
  },
  {
    file: 'src/styles/system/ui-primitives-interactions.css',
    forbidden: '.ui-country-tab',
    owner: 'removed unused country tab primitive; current country controls use feature-owned structured filter classes',
  },
  {
    file: 'src/styles/system/ui-primitives-interactions.css',
    forbidden: '.ui-country-tab-active',
    owner: 'removed unused country tab primitive; current country controls use feature-owned structured filter classes',
  },
  {
    file: 'src/styles/system/ui-primitives-interactions.css',
    forbidden: '.ui-country-tab-flag',
    owner: 'removed unused country tab primitive; current country controls use feature-owned structured filter classes',
  },
  {
    file: 'src/styles/system/ui-primitives-responsive.css',
    forbidden: '.ui-country-tab',
    owner: 'removed unused country tab primitive; responsive primitive layer must not keep stale country tab branches',
  },
  {
    file: 'src/styles/tokens/layout-components.css',
    forbidden: '--ui-country-tab-',
    owner: 'removed unused country tab primitive; do not keep dead country tab geometry tokens',
  },
  {
    file: 'src/styles/system/ui-error-boundary-contract.css',
    forbidden: '.ui-error-boundary-icon {',
    owner: 'removed unused error boundary icon wrapper; ErrorBoundary emits ui-error-boundary-icon-svg inside StateBlock',
  },
  {
    file: 'src/styles/system/ui-primitives-lightbox.css',
    forbidden: '.ui-lightbox-control-prev',
    owner: 'removed unused lightbox prev control; current lightbox uses gesture navigation and close control',
  },
  {
    file: 'src/styles/system/ui-primitives-lightbox.css',
    forbidden: '.ui-lightbox-control-next',
    owner: 'removed unused lightbox next control; current lightbox uses gesture navigation and close control',
  },
  {
    file: 'src/styles/system/ui-primitives-upload.css',
    forbidden: '.ui-status-pill',
    owner: 'removed unused status pill primitive; emitted status surfaces use feature-owned classes',
  },
  {
    file: 'src/styles/system/ui-skeleton-feed.css',
    forbidden: '.ui-skeleton-action',
    owner: 'removed unused feed skeleton action wrapper; current feed skeleton uses ui-feed-skeleton-action-*',
  },
  {
    file: 'src/styles/system/ui-skeleton-detail.css',
    forbidden: '.ui-skeleton-bottom-input',
    owner: 'removed unused detail skeleton bottom input; current detail skeleton bottom bar uses ui-skeleton-bottom-action',
  },
  {
    file: 'src/styles/system/ui-skeleton-primitives.css',
    forbidden: '.ui-skeleton-action-icon',
    owner: 'removed unused generic skeleton action icon; current feed skeleton owns ui-feed-skeleton-action-icon',
  },
  {
    file: 'src/styles/system/ui-skeleton-primitives.css',
    forbidden: '--ui-skeleton-action-icon-size',
    owner: 'removed unused generic skeleton action icon token',
  },
  {
    file: 'src/styles/system/ui-skeleton-primitives.css',
    forbidden: '.ui-skeleton-media--masonry',
    owner: 'removed unused masonry skeleton variant; current media skeleton variants are feed and detail',
  },
  {
    file: 'src/styles/system/ui-skeleton-primitives.css',
    forbidden: '--ui-skeleton-media-masonry-ratio',
    owner: 'removed unused masonry skeleton variant token',
  },
  {
    file: 'src/styles/features/chat-composer.css',
    forbidden: 'chat-eligibility',
    owner: 'removed chat eligibility selector; no current chat markup emits this class',
  },
  {
    file: 'src/styles/features/chat-composer.css',
    forbidden: 'chat-reply-context-main',
    owner: 'removed chat reply context main selector; no current chat markup emits this class',
  },
  {
    file: 'src/styles/features/create-promote-state.css',
    forbidden: 'background: color-mix(in srgb, var(--ui-social-surface) 92%, transparent)',
    owner: 'src/styles/tokens/feature-contracts.css post-create meta card surface token',
  },
  {
    file: 'src/styles/features/create-promote-state.css',
    forbidden: 'background: color-mix(in srgb, var(--ui-social-surface-muted) 70%, var(--ui-social-surface))',
    owner: 'src/styles/tokens/feature-contracts.css post-create meta row filled surface token',
  },
  {
    file: 'src/styles/features/create-promote-state.css',
    forbidden: 'border-color: color-mix(in srgb, var(--ui-danger-classic) 30%, transparent)',
    owner: 'src/styles/tokens/feature-contracts.css post-create meta row error border token',
  },
  {
    file: 'src/styles/features/create-promote-state.css',
    forbidden: 'background: color-mix(in srgb, var(--ui-danger-classic) 8%, var(--ui-social-surface))',
    owner: 'src/styles/tokens/feature-contracts.css post-create meta row error surface token',
  },
  {
    file: 'src/styles/features/create-promote-post-picker.css',
    forbidden: '42rem',
    owner: 'src/styles/tokens/feature-contracts.css semantic picker panel width token',
  },
  {
    file: 'src/styles/features/create-promote-post-picker.css',
    forbidden: '46rem',
    owner: 'src/styles/tokens/feature-contracts.css semantic picker panel desktop height token',
  },
  {
    file: 'src/styles/features/create-promote-post-picker.css',
    forbidden: '82vh',
    owner: 'src/styles/tokens/feature-contracts.css semantic picker panel desktop viewport token',
  },
  {
    file: 'src/styles/features/create-promote-post-picker.css',
    forbidden: '100svh',
    owner: 'src/styles/tokens/feature-contracts.css semantic picker panel mobile height token',
  },
  {
    file: 'src/styles/features/create-promote-post-picker.css',
    forbidden: '100dvh',
    owner: 'src/styles/tokens/feature-contracts.css semantic picker panel mobile height token',
  },
  {
    file: 'src/styles/features/chat-post-preview.css',
    forbidden: '320px',
    owner: 'src/styles/tokens/feature-contracts.css semantic preview width tokens',
  },
  {
    file: 'src/styles/features/home-feed-foundation.css',
    forbidden: 'home-floating-dock',
    owner: 'src/styles/features/home-floating-actions.css',
  },
  {
    file: 'src/styles/features/home-feed-foundation.css',
    forbidden: 'home-desktop-feed-shell',
    owner: 'src/ui/Skeleton.tsx and src/styles/system/ui-skeleton-contract.css',
  },
  {
    file: 'src/styles/features/home-topic-tabs-shell.css',
    forbidden: 'home-desktop-feed-shell',
    owner: 'src/ui/Skeleton.tsx and src/styles/system/ui-skeleton-contract.css',
  },
  {
    file: 'src/styles/features/home-structured-filters.css',
    forbidden: 'home-desktop-feed-shell',
    owner: 'src/ui/Skeleton.tsx and src/styles/system/ui-skeleton-contract.css',
  },
  {
    file: 'src/styles/02-core-surfaces.css',
    forbidden: 'ui-skeleton-shell',
    owner: 'src/styles/system/ui-skeleton-contract.css',
  },
  {
    file: 'src/styles/02-core-surfaces.css',
    forbidden: 'ui-skeleton-shimmer',
    owner: 'src/styles/system/ui-skeleton-contract.css',
  },
  {
    file: 'src/styles/utilities/motion-scroll.css',
    forbidden: '@keyframes shimmer',
    owner: 'src/styles/system/ui-skeleton-contract.css',
  },
  {
    file: 'src/styles/features/chat.css',
    forbidden: '--ui-topbar-content-max-width',
    owner: 'src/styles/components/topbar.css',
  },
  {
    file: 'src/styles/components/topbar.css',
    forbidden: 'border-bottom: var(--ui-border-width-hairline) solid var(--ui-topbar-border-color)',
    owner: 'src/styles/components/topbar.css no-separator topbar contract',
  },
  {
    file: 'src/styles/components/topbar.css',
    forbidden: 'backdrop-filter: var(--ui-topbar-backdrop-filter)',
    owner: 'src/styles/components/topbar.css shared solid page header contract',
  },
  {
    file: 'src/styles/features/category-feed.css',
    forbidden: 'box-shadow: var(--ui-social-topbar-shadow)',
    owner: 'src/styles/components/topbar.css shared topbar chrome',
  },
  {
    file: 'src/styles/features/category-feed.css',
    forbidden: 'border-bottom: var(--ui-border-width-hairline) solid var(--ui-social-line-soft)',
    owner: 'src/styles/components/topbar.css no-separator topbar contract',
  },
  {
    file: 'src/styles/features/post-detail.css',
    forbidden: 'border-bottom: var(--ui-border-width-hairline) solid var(--ui-topbar-border-color)',
    owner: 'src/styles/components/topbar.css no-separator topbar contract',
  },
  {
    file: 'src/styles/features/post-detail.css',
    forbidden: 'background: var(--ui-topbar-surface-standard)',
    owner: 'src/styles/components/topbar.css shared solid page header contract',
  },
  {
    file: 'src/styles/features/home-topic-tabs-shell.css',
    forbidden: 'background: color-mix(in srgb, var(--ui-color-white) 90%, transparent)',
    owner: 'src/styles/features/home-topic-tabs-shell.css solid home top category shell contract',
  },
  {
    file: 'src/styles/features/home-topic-tabs-shell.css',
    forbidden: 'justify-content: space-between',
    owner: 'src/styles/features/home-topic-tabs-shell.css full-width topic tab label contract',
  },
  {
    file: 'src/styles/features/home-topic-tabs-shell.css',
    forbidden: 'text-overflow: ellipsis;\n    white-space: nowrap;\n  }\n\n  .home-topic-filter-row',
    owner: 'src/styles/features/home-topic-tabs-shell.css full-width topic tab label contract',
  },
  {
    file: 'src/styles/features/home-topic-tabs-shell.css',
    forbidden: 'line-height: var(--ui-line-tight);\n    text-overflow: clip;\n    white-space: nowrap;\n  }\n\n  .home-topic-filter-row',
    owner: 'src/styles/features/home-topic-tabs-shell.css unclipped topic tab label contract',
  },
  {
    file: 'src/styles/features/chat.css',
    forbidden: 'chat-online-',
    owner: 'src/ui/TopbarActions.tsx and src/styles/system/ui-sticky-topbar-contract.css',
  },
  {
    file: 'src/styles/features/chat.css',
    forbidden: '--chat-bottom-nav-offset: calc(',
    owner: 'src/styles/components/bottom-nav.css shared page avoidance token',
  },
  {
    file: 'src/styles/features/create-promote-post-editor.css',
    forbidden: '.ui-loading-spinner',
    owner: 'src/styles/system/ui-primitives-feedback.css',
  },
  {
    file: 'src/styles/features/create-promote-keyboard.css',
    forbidden: 'background:',
    owner: 'src/styles/features/create-promote-foundation.css page surface contract',
  },
  {
    file: 'src/styles/features/create-promote-keyboard.css',
    forbidden: 'min-height:',
    owner: 'src/styles/features/create-promote-post-editor.css post-create page geometry',
  },
  {
    file: 'src/styles/features/create-promote-keyboard.css',
    forbidden: 'scroll-padding-top:',
    owner: 'src/styles/features/create-promote-post-editor.css post-create page geometry',
  },
  {
    file: 'src/styles/features/create-promote-foundation.css',
    forbidden: '.promote-mobile-page .promote-content-shell',
    owner: 'src/styles/features/promote-layout-shell.css',
  },
  {
    file: 'src/styles/features/create-promote-foundation.css',
    forbidden: '.promote-mobile-page .promote-step-header',
    owner: 'src/styles/features/promote-layout-shell.css',
  },
  {
    file: 'src/styles/features/create-promote-foundation.css',
    forbidden: '.promote-mobile-page .promote-step-hint',
    owner: 'src/styles/features/promote-layout-shell.css',
  },
  {
    file: 'src/styles/features/promote-layout-checkout.css',
    forbidden: 'overscroll-behavior:',
    owner: 'src/styles/features/promote-layout-choices.css picker scroll behavior',
  },
  {
    file: 'src/styles/features/promote-layout-checkout.css',
    forbidden: '-webkit-overflow-scrolling:',
    owner: 'src/styles/features/promote-layout-choices.css picker scroll behavior',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: '.ins-post-card .feed-card-author',
    owner: 'src/styles/components/feed-card-shell.css feed card author grid',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: '.profile-modern-page .profile-avatar-button',
    owner: 'src/styles/features/profile-avatar-action.css',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: '.user-space-avatar-next :is',
    owner: 'src/styles/features/profile-shared-header.css',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: '.ui-compact-action {',
    owner: 'src/styles/02-core-controls.css compact action base geometry',
  },
  {
    file: 'src/styles/system/ui-control-shape-contract.css',
    forbidden: '.ui-floating-tabbar {',
    owner: 'src/styles/system/ui-foundation-clean.css floating tabbar surface',
  },
  {
    file: 'src/styles/system/ui-foundation-clean.css',
    forbidden: '.ui-icon-button {',
    owner: 'src/styles/02-core-controls.css',
  },
  {
    file: 'src/styles/system/ui-foundation-clean.css',
    forbidden: ':focus-visible',
    owner: 'src/styles/01-base.css global focus visible contract',
  },
  {
    file: 'src/styles/system/ui-foundation-clean.css',
    forbidden: '\n  body {\n',
    owner: 'src/styles/01-base.css body base contract',
  },
  {
    file: 'src/styles/components/topbar-system.css',
    forbidden: 'home-topbar-online-',
    owner: 'src/ui/TopbarActions.tsx and src/styles/system/ui-sticky-topbar-contract.css',
  },
  {
    file: 'src/styles/components/topbar-system.css',
    forbidden: 'country-rank-topbar',
    owner: 'removed country rank topbar route; use an explicit ui-topbar variant if a current route needs one',
  },
  {
    file: 'src/styles/features/profile-modern.css',
    forbidden: 'profile-list-section--post-feed',
    owner: 'src/features/feed/PostFeedList.tsx and src/styles/components/feed-card-chrome.css',
  },
  {
    file: 'src/styles/features/profile-modern.css',
    forbidden: 'padding-inline: var(--ui-social-feed-list-padding-x);',
    owner: 'src/features/feed/PostFeedList.tsx and src/styles/components/feed-card-chrome.css',
  },
  {
    file: 'src/styles/features/category-feed.css',
    forbidden: 'category-feed-list',
    owner: 'src/features/feed/PostFeedList.tsx and src/styles/components/feed-card-chrome.css',
  },
  {
    file: 'src/styles/features/category-feed.css',
    forbidden: 'margin-inline: calc(50% - 50vw)',
    owner: 'src/features/feed/PostFeedList.tsx and src/styles/components/feed-card-chrome.css',
  },
  {
    file: 'src/styles/features/user-space-next.css',
    forbidden: 'user-space-post-list-mobile',
    owner: 'src/features/feed/PostFeedList.tsx and src/styles/components/feed-card-chrome.css',
  },
  {
    file: 'src/styles/features/user-space-next.css',
    forbidden: 'user-space-post-list-desktop',
    owner: 'src/features/feed/PostFeedList.tsx and src/styles/components/feed-card-chrome.css',
  },
  {
    file: 'src/styles/components/feed-card-chrome.css',
    forbidden: 'ui-feed-panel',
    owner: 'src/features/feed/PostFeedList.tsx and src/styles/components/feed-card-chrome.css',
  },
  {
    file: 'src/styles/components/feed-card-shell.css',
    forbidden: 'box-shadow: var(--ui-surface-card-shadow',
    owner: 'src/styles/components/feed-card-shell.css X/Threads row contract',
  },
  {
    file: 'src/styles/components/feed-card-shell.css',
    forbidden: 'border-radius: var(--ui-ins-card-radius)',
    owner: 'src/styles/components/feed-card-shell.css X/Threads row contract',
  },
  {
    file: 'src/styles/components/feed-card-responsive.css',
    forbidden: 'box-shadow: var(--ui-surface-card-shadow',
    owner: 'src/styles/components/feed-card-shell.css X/Threads row contract',
  },
  {
    file: 'src/styles/components/feed-card-responsive.css',
    forbidden: 'border-radius: var(--ui-ins-card-radius)',
    owner: 'src/styles/components/feed-card-shell.css X/Threads row contract',
  },
  {
    file: 'src/styles/system/ui-primitives-feedback.css',
    forbidden: 'ui-feed-panel',
    owner: 'src/features/feed/PostFeedList.tsx and src/styles/components/feed-card-chrome.css',
  },
  {
    file: 'src/styles/features/sponsor.css',
    forbidden: 'sponsor-balance-card',
    owner: 'src/styles/features/sponsor.css sponsor-workbench contract',
  },
  {
    file: 'src/styles/features/sponsor.css',
    forbidden: 'sponsor-panel',
    owner: 'src/styles/features/sponsor.css sponsor-workbench contract',
  },
  {
    file: 'src/styles/features/sponsor.css',
    forbidden: 'sponsor-quick-link',
    owner: 'src/features/sponsor/SponsorMobilePage.tsx sponsor-record-tabs contract',
  },
  {
    file: 'src/styles/features/sponsor.css',
    forbidden: 'sponsor-ledger-section',
    owner: 'src/features/sponsor/SponsorMobilePage.tsx sponsor-record-tabs contract',
  },
];

for (const { file, forbidden, owner } of selectorOwnershipRules) {
  if (!fs.existsSync(path.join(root, file))) continue;
  if (read(file).includes(forbidden)) {
    failures.push(`${file} must not style ${forbidden}; that surface is owned by ${owner}.`);
  }
}

const chromeVisualSelectorRe =
  /\.(?:ui-topbar|nav-blur|detail-page-topbar|home-topbar|profile-tabs-section|home-topic-tabs-sticky-shell|home-page-skeleton-topbar|home-page-skeleton-topic-shell)(?![-_a-zA-Z0-9])/;
const chromeVisualDeclarationRe =
  /\b(?:background|box-shadow|backdrop-filter|-webkit-backdrop-filter|border-top|border-bottom|border-block(?:-start|-end)?):/;
const chromeVisualOwnerFiles = [
  ...walk('src/styles/features', (entry) => entry.endsWith('.css')),
  'src/styles/system/ui-skeleton-home.css',
];

for (const file of chromeVisualOwnerFiles) {
  const source = read(file);
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const declarations = match[2];
    if (!chromeVisualSelectorRe.test(selector)) continue;
    if (!chromeVisualDeclarationRe.test(declarations)) continue;

    failures.push(
      `${file} must not give page chrome visual styling in selector "${selector}". Use src/styles/system/ui-sticky-topbar-contract.css and semantic ui-layer-* classes instead.`,
    );
  }
}

for (const file of walk('src', (entry) => /\.(tsx|ts)$/.test(entry))) {
  const source = read(file);
  const stylesheetImports = [...source.matchAll(/import\s+['"]([^'"]+\.css)['"];?/g)].map(
    (match) => match[1],
  );

  if (file === 'src/main.tsx') {
    const invalid = stylesheetImports.filter((target) => target !== './index.css');
    if (invalid.length > 0) {
      failures.push(`${file} may only import ./index.css, found ${invalid.join(', ')}`);
    }
    continue;
  }

  if (stylesheetImports.length > 0) {
    failures.push(
      `${file} must not import CSS directly; add it to a stable src/styles/layers/*.css entry instead.`,
    );
  }
}

for (const file of walk('src/styles', (entry) => entry.endsWith('.css'))) {
  const source = read(file);
  if (/(^|\/)[^/]*(final|polish|compat|bridge|correction|patch|hotfix|temporary|temp|hack|workaround|override)[^/]*\.css$/.test(file)) {
    failures.push(
      `${file} must not use temporary override naming such as final/polish/compat/bridge/correction/patch/hotfix/temp/hack/workaround/override; put the rule in the owning component, feature, utility, or system contract stylesheet.`,
    );
  }

  if (source.includes('!important')) {
    failures.push(
      `${file} must not use !important; move the rule to the owning layer or strengthen the semantic selector instead.`,
    );
  }

  if (source.includes('--ui-raw-')) {
    failures.push(
      `${file} must not define or consume numbered --ui-raw-* tokens; add a named semantic token instead.`,
    );
  }
}

const importParentsByTarget = new Map();
for (const file of ['src/index.css', ...walk('src/styles', (entry) => entry.endsWith('.css'))]) {
  const source = read(file);

  for (const match of source.matchAll(/@import\s+["']([^"']+)/g)) {
    const target = normalizeImportTarget(file, match[1]);
    if (!target) continue;

    const parents = importParentsByTarget.get(target) || [];
    parents.push(file);
    importParentsByTarget.set(target, parents);

    if (
      (file.startsWith('src/styles/features/') || file.startsWith('src/styles/components/')) &&
      match[1].startsWith('../system/')
    ) {
      failures.push(
        `${file} must not import system contracts directly; load shared contracts from src/styles/layers/contracts.css.`,
      );
    }

    if (file === 'src/styles/layers/contracts.css' && match[1].startsWith('../features/')) {
      failures.push(
        'src/styles/layers/contracts.css must not import feature-owned CSS; register feature CSS in src/styles/layers/features.css.',
      );
    }
  }
}

for (const [target, parents] of importParentsByTarget.entries()) {
  const uniqueParents = [...new Set(parents)];
  if (uniqueParents.length <= 1) continue;

  failures.push(
    `${target} is imported by multiple CSS entry files: ${uniqueParents.join(', ')}`,
  );
}

if (failures.length > 0) {
  console.error('[css-architecture-guards] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[css-architecture-guards] passed');
