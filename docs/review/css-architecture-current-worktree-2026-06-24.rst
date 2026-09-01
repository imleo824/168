CSS Architecture Current Worktree Audit - 2026-06-24
====================================================

Scope
-----

This document is the pre-remediation audit baseline for the current working
tree. The follow-up remediation result is recorded in
``docs/review/css-architecture-remediation-2026-06-24.rst``.

This audit maps the current working tree CSS architecture, import
relationships, token overrides, selector/property overlaps, and remaining
ownership risks. It is intentionally separate from the committed main-branch
audit because the working tree currently contains uncommitted chat, admin,
server/type, and public icon changes.

Baseline
--------

- Branch audited: ``main`` working tree.
- Current CSS entry: ``src/index.css``.
- Loaded CSS files under ``src/styles``: 116.
- Reachability from ``src/index.css``: 116 of 116 files.
- Unreachable CSS files: 0.
- Multi-parent CSS imports: 0.
- CSS lines under ``src/styles``: 16654.
- Duplicate root ``--ui-*`` token names: 153.
- Duplicate scoped ``--ui-*`` token names: 20.
- Selector/property overlaps: 277.
- Broad substring selectors such as ``[class*=...]``: 0.
- ``:has()`` selectors: 13.
- Public icon files are pre-existing dirty worktree changes and were not
  touched by this audit.

Current Load Architecture
-------------------------

``src/index.css`` still loads one stable chain:

1. ``tailwindcss``
2. ``src/styles/layers/foundation.css``
3. ``src/styles/layers/system-core.css``
4. ``src/styles/layers/components.css``
5. ``src/styles/layers/features.css``
6. ``src/styles/layers/contracts.css``

The import graph is healthy: all CSS is reachable through the entry chain and
no CSS file is imported by multiple parents. The remaining risk is not graph
chaos; it is ownership softness inside otherwise valid layers.

What Is Healthy
---------------

- CSS entry is centralized through ``src/index.css``.
- TS/TSX direct CSS import remains restricted to the app entry.
- All 116 CSS files under ``src/styles`` are reachable.
- No multi-parent CSS imports were found.
- Architecture and hardcoding gates currently pass.
- New temporary file names such as ``patch``, ``hotfix``, ``temp``, ``hack``,
  ``workaround``, and ``override`` are guarded.
- Historic cleanup names such as ``final``, ``polish``, ``compat``,
  ``bridge``, and ``correction`` remain guarded.
- Broad ``[class*=...]`` contract selectors are currently absent.
- ``!important``, ``--ui-raw-*``, and legacy base-token alias references remain
  guarded.

Key Findings
------------

P1. Current chat work adds a large owner and local presentation constants
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The dirty chat worktree adds post image previews inside
``src/styles/features/chat.css``. The feature works structurally, but from a
CSS architecture perspective it increases owner size and introduces local
presentation constants directly in feature CSS.

Evidence:

- ``src/styles/features/chat.css`` is now the largest CSS owner: 618 lines and
  71 selectors.
- ``.chat-post-message`` and ``.chat-post-images`` use ``320px`` directly for
  max width and grid width.
- ``.chat-post-image-frame`` uses ``aspect-ratio: 1 / 1`` directly.
- ``:root`` defines ``--chat-post-image-ratio: 4 / 3`` as a feature token, and
  runtime code writes the same custom property inline for single-image aspect
  ratio.
- ``src/styles/tokens/foundation.css`` currently adds
  ``--ui-font-weight-bold`` and ``--ui-text-lg``, but no current source
  references those tokens.

Impact:

- Chat now mixes shell, stream, message, composer, system card, and post-preview
  responsibilities in one file.
- Width and ratio values are not hardcoded colors, but they are still local
  layout constants that should have named ownership.
- Unused foundation aliases are especially risky because they make temporary
  compatibility names look like part of the design system.

Recommendation:

- Split chat into stable owners once the feature is accepted:
  ``chat-shell.css``, ``chat-stream.css``, ``chat-message.css``,
  ``chat-post-preview.css``, and ``chat-composer.css``.
- Move preview constants into named chat tokens such as
  ``--chat-post-preview-max-width`` and ``--chat-post-preview-square-ratio``.
- Keep the dynamic single-image ratio inline only because it is runtime media
  data, not a design constant.
- Remove unused foundation aliases unless a real cross-feature owner requires
  them.

P1. Late contracts still contain real implementation overrides
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/layers/contracts.css`` is correctly last-loaded, but parts of that
layer still carry complete visual/layout implementations instead of only
cross-page invariants.

Evidence:

- ``src/styles/system/ui-error-boundary-contract.css`` and
  ``src/styles/system/ui-primitives-feedback.css`` both define
  ``.ui-error-boundary``, ``.ui-error-boundary-icon``, and
  ``.ui-error-boundary-icon-svg``.
- The overlap matrix reports 17 selector/property overlaps between those two
  files.
- ``src/styles/system/ui-sticky-layer-contract.css`` owns sticky positioning,
  topbar surface behavior, shadow/blur reset, and mobile text-entry page
  spacing.

Impact:

- Late contracts can hide earlier primitive behavior.
- Future fixes are likely to land in the late layer because it wins in the
  cascade, even when the correct owner is a primitive or component file.

Recommendation:

- Choose one error-boundary owner and remove duplicate declarations from the
  other file.
- Keep ``contracts.css`` limited to rules that truly require last-load priority.
- Require owner comments for any future late contract that changes background,
  border, shadow, opacity, transform, position, or spacing.

P1. Sheet ownership remains split across core, primitives, and cleanup
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Shared sheet chrome is still defined by several system owners.

Evidence:

- ``src/styles/02-core-sheets-actions.css`` defines ``.ui-sheet`` and
  ``.ui-sheet-overlay``.
- ``src/styles/system/ui-primitives-layout.css`` also defines ``.ui-sheet`` and
  ``.ui-sheet-overlay``.
- ``src/styles/system/ui-foundation-clean.css`` also touches ``.ui-sheet``.
- ``src/styles/system/ui-primitives-responsive.css`` adjusts sheet overlay
  layout and sheet header behavior.

Impact:

- Bottom sheets and overlays are high-blast-radius UI. Small changes can affect
  profile, filters, post create, promote, auth, and payment flows.
- Current ownership requires reading multiple system files to know which sheet
  property wins.

Recommendation:

- Promote a single sheet facade owner.
- Split under that owner by responsibility: base, overlay, panel, header,
  handle, responsive.
- Keep feature CSS limited to feature sheet content and feature-specific panel
  sizing.

P1. Home first-paint CSS is system-loaded but feature-owned in practice
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/system/home-mobile-first-paint-contract.css`` is loaded from
``system-core`` before feature CSS, yet it targets Home-specific selectors.

Evidence:

- It targets ``.home-mobile-shell`` and ``.home-mobile-feed-panel``.
- It overlaps ``src/styles/features/home-feed-foundation.css`` on
  ``.home-mobile-feed-panel`` for display, min-height, flex, overflow, and
  overscroll behavior.
- It uses
  ``.home-mobile-shell.home-document-scroll-shell:has(.home-country-stories-shell)``
  to infer page composition.

Impact:

- Home scroll and first-paint behavior is split between a system layer and the
  Home feature owner.
- The file name says contract, but the declarations are page-specific layout.

Recommendation:

- Keep it in ``system-core`` only if early load is required for first paint.
- Document that requirement in the file and guard.
- Prefer explicit route/data state over ``:has()`` for Home page composition.

P1. Promote keyboard CSS is correcting layout owned by other files
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/features/create-promote-keyboard.css`` is supposed to own keyboard
and focus behavior, but it also changes promote chip and calendar layout.

Evidence:

- 8 overlaps with ``src/styles/features/promote-layout-choices.css`` on
  ``.promote-category-chip`` and child span overflow.
- 11 overlaps with ``src/styles/features/promote-layout-calendar.css`` on
  ``.promote-calendar-card``, ``.promote-calendar-grid``, and
  ``.promote-date-cell``.

Impact:

- A keyboard owner is silently acting as a layout patch.
- The intended visual owner is unclear and depends on import order.

Recommendation:

- Move chip width/overflow rules into ``promote-layout-choices.css``.
- Move calendar sizing/overflow rules into ``promote-layout-calendar.css``.
- Leave keyboard CSS for keyboard avoidance, viewport, and focused input
  behavior only.

P2. Token override policy is file-pair based, not intent based
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The duplicate root-token count is still high, and most of it is intentional
product token overriding. The guard currently allows known owner pairs.

Evidence:

- 153 duplicate root ``--ui-*`` token names.
- 85 duplicates between ``src/styles/00-product-tokens.css`` and
  ``src/styles/tokens/foundation.css``.
- 44 duplicates between ``src/styles/00-product-tokens.css`` and
  ``src/styles/tokens/layout-components.css``.
- 9 duplicates between product tokens and social contracts.
- 8 duplicates between product tokens and design contract tokens.

Impact:

- The current guard prevents unknown duplicate owners, but it does not record
  why an individual token is allowed to be overridden.
- A broad future token addition inside an allowed pair can pass without a clear
  design-system reason.

Recommendation:

- Add a per-token override manifest with owner, direction, and reason.
- Keep file-pair allowlists as a coarse safety net only.

P2. Topbar ownership is improved but still cross-coupled
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Topbar behavior is distributed across component, system, and contract files.

Evidence:

- Scoped duplicate topbar tokens appear across
  ``src/styles/00-product-tokens.css``,
  ``src/styles/components/topbar-system.css``,
  ``src/styles/components/topbar.css``, and
  ``src/styles/system/ui-detail-topbar-identity-contract.css``.
- ``src/styles/components/topbar.css`` contains 5 ``:has()`` selectors for
  slot and action composition.
- Detail identity still depends on
  ``src/styles/system/secondary-page-detail-topbar.css``.
- Sticky/page-level behavior still depends on
  ``src/styles/system/ui-sticky-layer-contract.css``.

Impact:

- Small topbar changes can affect route chrome, detail identity, sticky page
  spacing, and mobile action layout.
- ``:has()`` makes layout depend on descendant structure instead of explicit
  component state.

Recommendation:

- Keep base topbar structure in component CSS.
- Keep route/page sticky behavior in sticky-layer contract.
- Keep detail identity in its named detail contract.
- Convert high-impact ``:has()`` selectors to explicit data attributes when the
  React component already knows the state.

P2. Admin remains outside the strict hardcoding guard
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The hardcoding guard deliberately excludes Admin files.

Evidence:

- ``scripts/check-ui-hardcoding.mjs`` excludes ``src/features/admin`` and
  ``src/styles/features/admin.css``.
- The current worktree has dirty changes in
  ``src/features/admin/AdminPage.tsx``.

Impact:

- Admin can accumulate raw Tailwind values and local presentation constants
  without failing the product UI guard.
- This is acceptable only if Admin is deliberately treated as an internal tool
  outside the product UI contract.

Recommendation:

- Make the exception explicit in the frontend working rules.
- If Admin is product-facing, move it under the same token and hardcoding guard
  discipline as the rest of the app.

P2. ``:has()`` usage is still small but concentrated in high-leverage places
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``:has()`` usage grew to 13 selectors in the current worktree.

Current locations:

- Feed-card content expansion.
- Topbar slot/action composition.
- Post-create settings adjacency.
- Feed footer-only scroll shell.
- Home first-paint composition.
- Secondary detail topbar identity.
- Sticky layer page/topbar detection and mobile text-entry state.

Impact:

- Local component use is acceptable when the selector is narrow.
- Page, sticky, and topbar contracts are higher risk because markup changes can
  alter layout without TypeScript or tests noticing.

Recommendation:

- Keep ``:has()`` for local component convenience only.
- Use explicit data attributes for page chrome, sticky layer, and route
  composition states.

P2. Raw fallback and value debt still exists
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Current guards catch many hardcoded values, but some fallbacks and layout values
remain by design or by exception.

Evidence:

- ``src/styles/01-base.css`` uses ``var(--app-vh, 100dvh)``.
- ``src/styles/system/home-mobile-first-paint-contract.css`` and
  ``src/styles/system/mobile-viewport-contract.css`` use viewport and ``0px``
  fallbacks.
- ``src/styles/system/feed-scroll-shell.css`` contains a ``52px`` fallback for
  bottom nav height.
- ``src/styles/features/promote-layout-choices.css`` contains ``78vw`` and
  ``260px`` fallbacks for promote chips.
- Current chat WIP adds ``320px`` preview width and ``1 / 1`` square ratio
  directly in feature CSS.

Impact:

- Some viewport fallbacks are legitimate browser/runtime safety.
- Feature-level layout constants should still be named tokens so ownership is
  inspectable.

Recommendation:

- Maintain an explicit fallback allowlist for true browser/runtime fallbacks.
- Convert feature layout constants into named owner tokens.

P2. Audit tooling over-reports keyframe selector overlaps
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The selector/property overlap matrix treats keyframe ``to`` blocks as ordinary
selectors.

Evidence:

- ``to :: transform`` appears as a multi-file overlap across chat, promote,
  Home, feedback, skeleton, primitives, and motion files.

Impact:

- The audit output is useful, but keyframe rows create noise and hide real
  selector ownership conflicts.

Recommendation:

- Update the audit script to namespace keyframe blocks by animation name.
- Report duplicate animation names separately from selector/property overlaps.

Priority Remediation Queue
--------------------------

1. Remove or justify the two unused foundation aliases added in the dirty
   worktree.
2. Tokenize and split the chat post-preview CSS before merging the chat
   feature.
3. Collapse error-boundary definitions into one owner.
4. Create a single sheet owner facade and move duplicate sheet declarations
   under it.
5. Move promote chip/calendar overflow fixes out of keyboard CSS.
6. Decide whether Home first-paint is a documented early-load exception or a
   Home feature owner.
7. Add per-token override intent metadata for duplicate root tokens.
8. Replace high-impact page/topbar ``:has()`` selectors with explicit data
   state where possible.
9. Make the Admin hardcoding exception explicit, or bring Admin into the same
   guard discipline.
10. Improve audit tooling for keyframes and fallback allowlists.

Verification
------------

Already run during this audit:

- ``npm run analyze:css-architecture``
- CSS reachability scan from ``src/index.css``
- Duplicate token and selector/property matrix extraction
- Raw fallback/value sampling
- ``npm run test:css-architecture``
- ``npm run lint:ui-hardcoding``

Both CSS architecture and UI hardcoding gates pass on the current working tree.
