CSS Architecture Remediation - 2026-06-25
=========================================

Scope
-----

This follow-up remediation continues the CSS architecture cleanup after the
2026-06-24 owner-boundary pass. The focus was to remove coarse token override
allowlists and remove structural ``:has()`` selectors from page chrome,
sticky layout contracts, and local component CSS.

Final Baseline
--------------

- CSS files under ``src/styles``: 122.
- CSS lines under ``src/styles``: 17317.
- Duplicate root ``--ui-*`` token names: 153.
- Duplicate scoped ``--ui-*`` token names: 22.
- Selector/property overlaps: 184.
- Broad ``[class*=...]`` selectors: 0.
- ``:has()`` selectors: 0.

Resolved Architecture Issues
----------------------------

1. Per-token root override manifest
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The architecture guard no longer allows duplicate root tokens by broad file
pairs. It now reads ``scripts/css-token-override-manifest.mjs`` and requires
every duplicate root ``--ui-*`` token to be explicitly listed with:

- owning files,
- override direction,
- reason,
- token name.

The guard also rejects stale manifest entries. If a listed token no longer has
the recorded duplicate ownership, the check fails instead of preserving
historical baggage.

2. Topbar state without structural ``:has()``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/ui/PageHeader.tsx`` now exposes explicit topbar state:

- ``data-leading-kind``
- ``data-action-kind``

``src/styles/components/topbar.css`` uses those states instead of descendant
``:has()`` checks for default back-button geometry and empty start-title slots.

The old ``.ui-header-actions:has(...)`` branch was removed because no current
markup owns that structure.

3. Detail topbar identity without structural ``:has()``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/system/secondary-page-detail-topbar.css`` now targets explicit
detail topbar classes:

- ``detail-page-topbar``
- ``detail-skeleton-topbar``
- ``detail-topbar-inner``
- ``detail-topbar-left``

``src/ui/Skeleton.tsx`` now passes the same detail topbar inner/left classes as
the real detail page skeleton contract.

4. Sticky layer without page-level ``:has()``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/system/ui-sticky-layer-contract.css`` no longer styles page
containers with ``:has(.ui-topbar)``. Sticky chrome is applied to the actual
``.ui-topbar`` / ``ui-layer-*`` elements.

Mobile text-entry scroll padding is applied to known page scroll containers
without detecting child topbars.

5. Local component ``:has()`` removed
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The remaining local structure selectors were replaced with explicit owner
state:

- feed cards expose ``x-card-body--with-expand`` for expanded tag spacing,
- chat replies expose ``chat-reply-quote--text-only`` / ``--with-thumb``,
- post-create settings rows expose ``post-create-settings-row--before-followup``,
- feed scroll content exposes ``data-feed-footer-only``.

These states make the styling contract readable from the component owner
instead of relying on descendant or sibling layout.

6. Guard coverage expanded
~~~~~~~~~~~~~~~~~~~~~~~~~~

``scripts/css-architecture-guards.mjs`` now fails if any stylesheet under
``src/styles`` uses ``:has()`` again. Components must expose explicit semantic
classes or ``data-*`` state instead.

``docs/process/frontend-working-rules.rst`` also records the same contract:
CSS state must be explicit, token overrides must be listed per token, and
stale compatibility selectors must be removed rather than preserved as
historical memory.

7. Follow button owner consolidated
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/components/feed-card-actions.css`` was deleted because it had
become a second owner for Follow button structure and state. Follow button
layout, pending interaction, and following state now live in
``src/styles/components/feed-follow-interaction.css``.

``src/features/social/FollowButton.tsx`` no longer emits legacy state classes
such as ``feed-follow-button-following`` / ``feed-follow-button--following`` /
``feed-follow-button--new``. The stable contract is ``data-follow-state``.

The architecture guard now prevents both the deleted CSS owner and the legacy
classes from returning.

8. Selector/property overlap cleanup
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Several cross-owner overlaps were removed by moving the final behavior back to
the real owner instead of preserving late overrides:

- ``src/styles/components/feed-card-actions.css`` was removed;
- ``.ui-loading-spinner`` styling is owned only by
  ``src/styles/system/ui-primitives-feedback.css``;
- create/promote keyboard CSS no longer owns page background, min-height, or
  top scroll padding;
- Promote shell, step header, and step hint styling moved out of shared
  create/promote foundation into ``promote-layout-shell.css``;
- promote picker scroll behavior is owned by ``promote-layout-choices.css``;
- feed card author grid stayed in ``feed-card-shell.css``;
- profile/user-space avatar shape stayed in profile shared/avatar owners;
- ``.ui-icon-button``, ``.ui-compact-action``, global ``:focus-visible``, and
  ``body`` base styling were moved back to their base/core owners;
- a no-op Home topic padding override was deleted.

The audit now reports 184 selector/property overlaps. The remaining non-root
overlaps are mostly breakpoint token overrides, responsive primitive contracts,
route overlay stability, and keyframe parser noise.

9. Selector/property overlap manifest
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``scripts/css-architecture-guards.mjs`` now reads
``scripts/css-selector-overlap-manifest.mjs`` and rejects any non-root
selector/property overlap that is not explicitly listed with:

- selector,
- property or properties,
- owning files,
- reason.

The guard also rejects stale manifest entries. This makes the remaining
responsive contracts and audit parser noise accountable instead of letting new
late overrides blend into the baseline.

10. Post-create picker geometry tokenized
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/features/create-promote-post-picker.css`` now consumes semantic
picker geometry tokens instead of embedding raw panel widths or viewport
heights in the feature stylesheet.

The geometry contract is defined in
``src/styles/tokens/feature-contracts.css``:

- ``--post-create-picker-panel-height``
- ``--post-create-picker-panel-height-svh``
- ``--post-create-picker-panel-height-dvh``
- ``--post-create-picker-panel-max-width``
- ``--post-create-picker-panel-desktop-max-height``
- ``--post-create-picker-panel-desktop-viewport-height``
- ``--post-create-picker-panel-desktop-height``

``scripts/css-architecture-guards.mjs`` now rejects raw ``42rem``, ``46rem``,
``82vh``, ``100svh`` and ``100dvh`` in the picker stylesheet. The raw viewport
and size values belong to the semantic token owner, not the feature CSS owner.

11. Home structured filter overlay uses sheet slots
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/02-core-sheets-actions.css`` now exposes explicit BottomSheet
overlay slots:

- ``--ui-sheet-overlay-background``
- ``--ui-sheet-overlay-filter``

``src/styles/features/home-structured-filters.css`` only assigns those slots
from Home-owned semantic tokens in ``src/styles/tokens/social-contracts.css``:

- ``--home-structured-filter-overlay-background``
- ``--home-structured-filter-overlay-filter``

The architecture guard rejects the previous stronger compound selector
``.ui-sheet-overlay.home-structured-filter-overlay`` and direct hardcoded
overlay background/filter overrides in the feature stylesheet.

12. Post-create state and meta controls use feature contracts
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/features/create-promote-state.css`` no longer owns local option
state tokens. The live ``post-create-meta-*`` state-card contract now lives in
``src/styles/tokens/feature-contracts.css``:

- ``--post-create-option-selected-*``
- ``--post-create-option-idle-*``
- ``--post-create-meta-card-surface``
- ``--post-create-meta-row-filled-surface``
- ``--post-create-meta-row-error-*``

The stale ``post-create-category-meta*`` selector family was removed after
cross-checking current TSX usage; the live component classes are
``post-create-meta-*`` from ``src/features/post-create/postCreateComponents.tsx``.
The architecture guard now rejects the old selector family, local state-token
definitions, and direct state-card ``color-mix`` surfaces in the feature
stylesheet.

13. Dead post-create category-meta selectors removed
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``scripts/analyze-css-unused.mjs`` reported the old
``post-create-category-meta*`` selector family as high-confidence unused.
Cross-checking current TSX confirmed those classes are no longer emitted; the
active category metadata UI uses ``post-create-meta-*``.

The stale selectors and their now-unused control tokens were deleted. The
unused CSS report moved from ``182`` unused / ``180`` high-confidence unused
classes to ``170`` unused / ``168`` high-confidence unused classes.

14. Dead country rank topbar branch removed
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The unused ``country-rank-topbar`` selector and its only supporting token
``--ui-topbar-surface-country`` were deleted after a full-source search showed
no TS/TSX or CSS consumer beyond their own definitions. The architecture guard
now rejects both names from returning.

The unused CSS report moved again from ``170`` unused / ``168`` high-confidence
unused classes to ``169`` unused / ``167`` high-confidence unused classes.

15. Feed action icons and sync/contact actions normalized
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Feed and detail action icons now share the same semantic visual language:

- heat uses a neutral trending icon instead of the old flame symbol;
- like uses the thumb icon in both feed cards and detail bottom actions;
- Telegram sync/contact icon actions are explicit icon-only neutral controls.

``src/styles/components/feed-card-footer.css`` owns the feed icon-only action
contract through ``feed-action-btn--icon-only``. ``src/styles/00-product-tokens.css``
defines the semantic hover/status slots:

- ``--ui-feed-action-icon-only-hover-surface``
- ``--ui-feed-action-status-dot-size``

``src/styles/components/telegram-contact-action.css`` no longer makes contact
icons brand-blue by default. ``src/styles/features/create-promote-post-editor.css``
keeps the publish-page Telegram tool neutral in off/on/hover states. The
architecture guard now rejects regressions back to flame/heart icons and
brand-blue icon-only surfaces.

16. Unused CSS audit and Home topic tabs cleanup
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``scripts/analyze-css-unused.mjs`` now collects CSS class definitions before
scanning source files. It still reads direct ``className`` usage, but also
recognizes reusable class constants and component class props by scanning source
string literals against the known CSS class set. This removed dynamic-class
false positives from the unused report before deletion work continued.

The old Home country-stories owner was removed:

- ``src/styles/features/home-country-stories.css`` was deleted;
- ``home-country-stories-shell`` became ``home-topic-tabs-sticky-shell``;
- ``home-has-country-stories`` became ``home-has-sticky-topic-tabs``;
- dead ``home-country-story-*``, ``country-story-*``, story-ring, and Home
  create-mark tokens were removed;
- the Profile avatar camera badge now owns
  ``--ui-profile-avatar-camera-badge-*`` tokens instead of consuming old Home
  create-mark tokens.

The architecture guard now keeps the deleted file and stale Home story names
from returning. The unused CSS report moved from ``169`` unused / ``167``
high-confidence classes with the old parser to ``63`` / ``63`` after parser
calibration and Home country-stories cleanup. The CSS architecture baseline
moved to ``121`` files, ``16962`` lines, ``21`` duplicate scoped tokens and
``179`` selector/property overlaps.

17. Dead one-off selectors removed from active owners
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The calibrated unused report exposed a small group of selectors that had no
current TS/TSX emitter and no dynamic class source. These were removed from
their real owners instead of being masked with a compatibility allowlist:

- ``app-bottom-nav-count`` from ``src/styles/components/bottom-nav.css``;
- ``detail-bottom-action--view`` and the stale ``detail-quotes-state`` wrapper
  from ``src/styles/features/post-detail.css``;
- ``post-create-submit-spinner`` plus its dead token and ``post-create-spin``
  keyframes;
- ``post-create-picker-clear``, ``post-create-category-clear`` and
  ``post-create-location-option-country``;
- ``chat-eligibility`` and ``chat-reply-context-main`` from the current chat
  composer owner.

``scripts/css-architecture-guards.mjs`` now rejects these names from returning.
The unused report moved from ``63`` unused / ``63`` high-confidence classes to
``54`` / ``54``. The CSS architecture baseline moved to ``121`` files and
``16830`` lines.

18. Stale Home, media and sponsor selector memories removed
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The next calibrated unused pass removed selector families that were no longer
emitted by current components and only survived as CSS memory:

- ``home-structured-filter-label`` and the hidden
  ``home-structured-location-country`` sublabel from
  ``src/styles/features/home-structured-filters.css``;
- ``post-create-initial-settings*`` from the current post-create editor owner;
- old Home topbar logo/profile/word fallback selectors from
  ``src/styles/components/topbar-system.css`` and their stale system-contract
  exceptions;
- ``media-grid-brand-placeholder*`` and ``media-grid-gap`` from
  ``src/styles/components/media.css`` after ``PostMediaGrid`` was verified to
  use ``media-grid-loading-copy`` / ``media-grid-loading-text`` instead;
- ``sponsor-row-order`` from ``src/styles/features/sponsor.css`` after the
  live rows were verified to use ``sponsor-row-meta`` plus ``RecordIdRow``.

The architecture guard now rejects these stale selector families from returning.
The unused report moved from ``54`` unused / ``54`` high-confidence classes to
``40`` / ``40``. This keeps the cleanup on the real owner boundary: removed
selectors are deleted from their owners, not preserved through compatibility
exceptions or late overrides.

19. Feed action icon contract tightened
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The feed/detail action row was tightened around current product semantics:

- heat now uses ``ChartNoAxesColumnIncreasing`` in both feed cards and detail
  bottom actions, replacing the previous abstract trend glyph without
  reintroducing warm/fire accents;
- like remains the explicit ``ThumbsUp`` action in feed and detail, with active
  emphasis still using the single product brand color;
- Telegram/channel sync stays a neutral icon-only action. The old status-dot
  pseudo-element and its two product tokens were removed instead of hidden by a
  stronger selector, so the icon no longer carries an extra default-looking
  colored surface or border;
- ``ui-button-primary`` visual ownership was removed from
  ``ui-foundation-clean.css`` and kept in
  ``ui-control-shape-contract.css`` only.

``scripts/check-ui-hardcoding.mjs`` and
``scripts/css-architecture-guards.mjs`` now reject the old heat glyph, the old
Telegram status-dot surface, the deleted status-dot tokens, and primary button
visuals returning to foundation. The audit baseline is now ``121`` CSS files,
``16634`` lines, ``176`` selector/property overlaps, ``0`` broad class
substring selectors, and ``0`` ``:has()`` selectors. The unused report is down
to ``9`` high-confidence entries; the remaining items are dynamic class APIs or
still require separate owner review.

Verification
------------

Checks run during this remediation:

- ``npm run test:css-syntax``
- ``npm run test:css-architecture``
- ``npm run lint:ui-hardcoding``
- ``node scripts/overlay-guards.mjs``
- ``npm run lint``
- ``npm run build``
- ``npm run test``

Remaining Architecture Watchlist
--------------------------------

The current guard now blocks broad class substring selectors and all CSS
``:has()`` selectors. The remaining architecture watchlist is intentional and
tracked:

- duplicate root tokens must stay listed per token in
  ``scripts/css-token-override-manifest.mjs``;
- selector/property overlaps remain visible in the audit matrix and should be
  reduced only by moving rules into the true owner, not by adding late
  overrides;
- large feature owners such as post detail, admin, promote choices, auth
  primitives, and media should continue to be split only when a touched area
  has a clear owner boundary.
