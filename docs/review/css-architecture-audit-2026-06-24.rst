CSS Architecture Audit - 2026-06-24
===================================

Scope
-----

This audit maps the current CSS architecture, import relationships, token
overrides, selector/property overlaps, and remaining ownership risks.

Baseline
--------

- Commit audited: ``da3f36b fix shared tab surfaces and profile header alignment``.
- Dirty files excluded from audit scope: ``public/apple-touch-icon.png``,
  ``public/favicon-32.png``, ``public/icon-192.png``, ``public/icon-512.png``,
  ``public/icon.png``, and ``public/share-fallback.png``.
- CSS entry: ``src/index.css``.
- Loaded CSS files under ``src/styles``: 116.
- Reachability from ``src/index.css``: 116 of 116 files.
- Unreachable CSS files: 0.
- Multi-parent CSS imports: 0.
- CSS lines under ``src/styles``: 16480.
- Duplicate root ``--ui-*`` token names: 153.
- Duplicate scoped ``--ui-*`` token names: 21.
- Selector/property overlaps: 277.
- Broad ``[class*=...]`` selectors: 0.
- ``:has()`` selectors: 11.

Current Load Architecture
-------------------------

``src/index.css`` loads one stable chain:

1. ``tailwindcss``
2. ``src/styles/layers/foundation.css``
3. ``src/styles/layers/system-core.css``
4. ``src/styles/layers/components.css``
5. ``src/styles/layers/features.css``
6. ``src/styles/layers/contracts.css``

The main ownership model is now coherent:

- ``foundation`` owns token facades, product/profile/promote token overlays,
  base rules, core controls/surfaces/sheets, and foundation cleanup.
- ``system-core`` owns primitives, skeletons, first-paint runtime contracts,
  feed scroll shells, viewport contracts, and motion utilities.
- ``components`` owns reusable component CSS: buttons, topbar, bottom nav, feed
  cards, media, profile dialog, and contact actions.
- ``features`` owns route and domain composition.
- ``contracts`` is the last-loaded safety layer for cross-page contracts.

What Is Healthy
---------------

- The CSS import graph is centralized through ``src/index.css``.
- TS/TSX direct CSS import is restricted to ``src/main.tsx`` importing
  ``./index.css``.
- Every CSS file under ``src/styles`` is reachable from the entry graph.
- No CSS file is imported by multiple parents.
- Removed history/patch files are guarded from returning, including
  ``final``, ``polish``, ``compat``, ``bridge``, and ``correction`` style
  names.
- ``!important`` and ``--ui-raw-*`` are guarded.
- Broad substring selectors such as ``[class*=...]`` are currently absent.
- Product brand/color discipline is now encoded in both hardcoding and
  architecture guards.

Key Findings
------------

P1. Late contracts still contain real overrides
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/layers/contracts.css`` is correctly last-loaded, but some files in
that layer still carry full visual/layout implementations rather than only
small cross-page contracts.

Evidence:

- ``src/styles/system/ui-error-boundary-contract.css`` and
  ``src/styles/system/ui-primitives-feedback.css`` both define
  ``.ui-error-boundary``, ``.ui-error-boundary-icon``, and
  ``.ui-error-boundary-icon-svg``.
- The overlap matrix reports 17 duplicate selector/property entries between
  those two files.
- ``src/styles/system/ui-sticky-layer-contract.css`` owns sticky positioning,
  topbar surface, box shadow, blur reset, and mobile text-entry scroll padding.

Impact:

- Later contract files can hide earlier primitive behavior.
- Future fixes may land in the late layer because it appears to "win", making
  owner boundaries softer over time.

Recommendation:

- Move the complete error-boundary implementation into one owner. Keep either
  ``ui-primitives-feedback.css`` as the primitive owner or
  ``ui-error-boundary-contract.css`` as the dedicated owner, but not both.
- Keep ``contracts.css`` limited to cross-page invariants that genuinely need
  last-load priority.

P1. Home first-paint contract is feature-specific but system-core loaded
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/system/home-mobile-first-paint-contract.css`` is loaded from
``system-core`` before Home feature CSS. It is guarded to only target Home
classes, which is good, but it still owns Home-specific layout.

Evidence:

- It targets ``.home-mobile-shell`` and ``.home-mobile-feed-panel``.
- It overlaps ``src/styles/features/home-feed-foundation.css`` on
  ``.home-mobile-feed-panel`` for display, min-height, flex, overflow, and
  overscroll behavior.
- It includes a page-state selector:
  ``.home-mobile-shell.home-document-scroll-shell:has(.home-country-stories-shell)``.

Impact:

- Home first-paint behavior is split between an early system layer and a feature
  owner.
- Fixes to Home scroll/sticky behavior require understanding both load timing
  and feature composition.

Recommendation:

- Keep it in ``system-core`` only if early load is required for first paint.
  Document that requirement in the file and guard.
- Otherwise, move the contract into the Home feature owner and use tokens/data
  state for any first-paint dependency.

P1. Promote keyboard CSS is acting as an overflow/layout patch
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/features/create-promote-keyboard.css`` owns keyboard/form focus
behavior, but it also restyles promote category chips and calendar cells.

Evidence:

- It overlaps ``src/styles/features/promote-layout-choices.css`` on
  ``.promote-category-chip`` and child spans.
- It overlaps ``src/styles/features/promote-layout-calendar.css`` on
  ``.promote-calendar-card``, ``.promote-calendar-grid``, and
  ``.promote-date-cell``.
- The overlap matrix reports 8 entries with choices and 11 entries with
  calendar.

Impact:

- A keyboard/focus owner is silently correcting promote layout.
- The later promote layout layer can override it, so intent depends on import
  order instead of owner clarity.

Recommendation:

- Move chip overflow rules into ``promote-layout-choices.css``.
- Move calendar sizing/overflow rules into ``promote-layout-calendar.css``.
- Leave ``create-promote-keyboard.css`` focused on keyboard avoidance,
  viewport/focus behavior, and mobile input font safeguards.

P1. Sheet ownership is still split across core, primitives, and cleanup
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``.ui-sheet`` and ``.ui-sheet-overlay`` are defined in multiple system files.

Evidence:

- ``src/styles/02-core-sheets-actions.css`` defines ``.ui-sheet`` and
  ``.ui-sheet-overlay``.
- ``src/styles/system/ui-primitives-layout.css`` also defines
  ``.ui-sheet`` and ``.ui-sheet-overlay``.
- ``src/styles/system/ui-foundation-clean.css`` also touches ``.ui-sheet``.
- ``src/styles/system/ui-primitives-responsive.css`` adjusts sheet overlay and
  sheet header behavior.

Impact:

- Sheet behavior is harder to reason about than the import graph suggests.
- Cross-page overlays are high-risk because small changes can affect auth,
  filters, profile, post create, and promote flows.

Recommendation:

- Promote a single sheet owner facade, then split base, overlay, header, panel,
  and responsive variants under that owner.
- Keep feature files limited to feature-specific sheet content, not sheet
  chrome.

P2. Token overrides are allowed by file-set, not by token intent
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The duplicate token count is high but mostly intentional. Current guards allow
known override file pairs.

Evidence:

- 153 duplicate root token names remain.
- 87 overlaps are between ``src/styles/00-product-tokens.css`` and
  ``src/styles/tokens/foundation.css``.
- 44 overlaps are between ``src/styles/00-product-tokens.css`` and
  ``src/styles/tokens/layout-components.css``.
- The architecture guard allowlists file-set override paths.

Impact:

- The guard prevents unknown duplicate owners, but it does not explain why an
  individual token may be overridden.
- A future broad token addition inside an allowed file pair can pass even if
  the intent is fuzzy.

Recommendation:

- Add a per-token override manifest for duplicated root tokens.
- Record owner, override direction, and reason, for example
  ``foundation -> product`` or ``layout -> product``.

P2. Large owner files still carry broad responsibility
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The largest files are legitimate owners, but some are still too broad for
low-risk maintenance.

Largest current owners:

- ``src/styles/features/chat.css``: 531 lines.
- ``src/styles/features/admin.css``: 484 lines.
- ``src/styles/components/feed-card-shell.css``: 467 lines.
- ``src/styles/components/media.css``: 446 lines.
- ``src/styles/features/post-detail.css``: 432 lines.
- ``src/styles/system/ui-primitives-auth.css``: 431 lines.

Impact:

- Local changes inside these files have a larger blast radius.
- Reviews must inspect unrelated selectors to confirm that a narrow fix is safe.

Recommendation:

- Split only when a stable owner boundary is obvious. Suggested first targets:
  chat composer/history/rules, media grid/lightbox/carousel, post detail
  article/bottom actions/header, and auth brand/form/state.

P2. ``:has()`` is used in high-leverage layout contracts
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``:has()`` usage is limited but present in shared layers.

Evidence:

- ``src/styles/system/ui-sticky-layer-contract.css`` uses page-level
  ``:has(.ui-topbar)`` and mobile text-entry ``:has(> .ui-topbar)``.
- ``src/styles/system/secondary-page-detail-topbar.css`` detects
  ``.detail-topbar-author`` with ``:has()``.
- ``src/styles/components/topbar.css`` detects empty slots and compact action
  composition with ``:has()``.
- ``src/styles/system/home-mobile-first-paint-contract.css`` detects Home
  country stories with ``:has()``.

Impact:

- These selectors are readable but couple layout to descendant structure.
- Markup changes can alter sticky/header behavior without touching CSS.

Recommendation:

- Prefer explicit data attributes for page-level state and high-impact chrome
  variants.
- Keep ``:has()`` for small local component adjustments where markup coupling is
  acceptable.

P2. Animation ownership has one concrete mismatch
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``post-create-spin`` is used by post-create editor selectors but defined in the
responsive file.

Evidence:

- ``src/styles/features/create-promote-post-editor.css`` uses
  ``animation: post-create-spin ...``.
- ``src/styles/features/create-promote-responsive.css`` defines
  ``@keyframes post-create-spin``.

Impact:

- The animation works, but owner discovery is backwards.
- A future responsive split could remove a keyframe needed by the editor.

Recommendation:

- Move ``@keyframes post-create-spin`` into the editor owner or into a shared
  motion utility with a ``ui-`` prefixed name.

P2. Control shape contract is explicit but high-maintenance
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The old broad ``[class*=...]`` catch-all approach is gone. The replacement is a
large explicit semantic selector list in
``src/styles/system/ui-control-shape-contract.css``.

Impact:

- This is safer than substring matching, but every new control class must be
  remembered manually.
- Missed classes will create local shape drift.

Recommendation:

- For new controls, prefer a shared semantic class or data attribute such as
  ``data-ui-control`` instead of growing the list indefinitely.

P3. Hardcoding blind spots are intentional but should be tracked
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``lint:ui-hardcoding`` passes. Remaining raw values outside token layers are
limited and mostly intentional.

Evidence:

- Admin UI has explicit exclusions in ``scripts/check-ui-hardcoding.mjs``.
- ``src/features/upload/imageUploadPipeline.ts`` uses ``#ffffff`` for image
  canvas behavior.
- ``src/platform/SEO.tsx`` uses ``#ffffff`` for ``theme-color``.

Impact:

- Admin remains outside the strict visual-token gate.
- This is acceptable if Admin is treated as a separate operational UI, but it
  should not become precedent for user-facing surfaces.

Recommendation:

- Keep Admin excluded only if it remains intentionally separate.
- If Admin becomes product-facing, move it into the same token discipline.

Verification
------------

Commands run against the audited state:

- ``npm run analyze:css-architecture``
- Custom import reachability and multi-parent import scan.
- Selector/property overlap grouping from ``scripts/css-architecture-audit.mjs --json``.
- ``npm run test:css-architecture``
- ``npm run lint:ui-hardcoding``

Result:

- Architecture guard passed.
- UI hardcoding guard passed.
- Import graph is fully reachable and single-parented.

Recommended Cleanup Order
-------------------------

1. Collapse duplicate error-boundary ownership into one file.
2. Move promote chip/calendar overflow rules out of keyboard CSS.
3. Decide whether Home first-paint must remain system-core; if yes, document
   the invariant and keep the overlap guarded; if no, move it to Home feature
   ownership.
4. Create a single sheet owner facade and move sheet chrome rules behind it.
5. Add a per-token override manifest for the 153 duplicate root tokens.
6. Move ``post-create-spin`` keyframes to the owner that uses it.
7. Split the largest files only along obvious owner boundaries.
