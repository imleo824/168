Frontend Working Rules
======================

This project treats the frontend style system as product infrastructure. UI work must improve the shared system instead of adding one-off fixes.

Current Source of Truth
-----------------------

These rules replace older informal UI notes, temporary patch decisions, and page-specific memories. If an older note conflicts with this document, this document wins.

Frontend decisions must be made in this order:

1. Design tokens in ``src/styles/00-tokens.css``.
2. Foundation and primitives in ``src/styles/system``.
3. Reusable component CSS in ``src/styles/components``.
4. Feature composition CSS in ``src/styles/features``.
5. JSX class names only when they describe stable structure or state.

Style System Rules
------------------

0. Solve frontend problems through reusable system design.

   - Every UI, CSS, interaction, media, loading, refresh, empty, and responsive issue must first be classified by ownership: token, foundation, primitive, component, feature composition, or page markup.
   - The default solution must be a reusable token, semantic class, shared component behavior, or shared utility. A local JSX/class/CSS tweak is allowed only when the behavior is truly page-specific.
   - Do not solve a visible defect by hardcoding a value that only fits the current screen, dataset, viewport, post count, or browser state.
   - Do not add temporary names, one-off branches, magic numbers, or release-only patches as the normal implementation path.
   - If a special case reveals a repeated product pattern, promote the pattern into the shared system before applying it to the page.
   - Existing legacy hacks are not precedent. When touching nearby code, move the solution toward the shared architecture instead of extending the hack.

1. No hardcoded frontend styling in components.

   - Do not add Tailwind palette classes such as ``text-gray-*``, ``bg-slate-*``, ``border-red-*``.
   - Do not add arbitrary pixel/rem/viewport classes such as ``w-[...]``, ``max-h-[...]``, ``top-[...]`` unless the value is already expressed through an approved semantic class.
   - Do not add ad hoc shadows, rings, gradients, opacity color suffixes, or ``hover:ui-*`` style combinations in JSX.

2. Style changes must converge into the foundation.

   - Global decisions belong in tokens, foundation, primitives, or shared component CSS.
   - Feature-specific decisions belong in the existing feature foundation file for that domain.
   - Repeated layout, spacing, typography, state, or media rules must become semantic utilities or reusable component classes.

3. Do not create random new style files.

   - Add a new CSS file only when there is a clear ownership boundary and it is wired into the existing style architecture.
   - Prefer extending existing files such as ``00-tokens.css``, ``ui-foundation-clean.css``, ``ui-primitives.css``, component CSS, or feature foundation CSS.
   - Temporary patch files, scattered override files, and page-only visual hacks are not allowed.

4. Future frontend iteration must happen from the bottom up.

   - First upgrade tokens and shared primitives.
   - Then update component or feature-level semantic classes.
   - Only then adjust page markup, and page markup should describe product structure rather than visual constants.

5. Every frontend change must pass the style gate.

   - Run ``node scripts/check-ui-hardcoding.mjs``.
   - Run TypeScript validation.
   - If a new styling pattern is valid, encode it in the checker or the design system so future changes are governed by the same rule.

CSS Architecture Contract
-------------------------

This is a hard contract, not guidance. CSS changes are acceptable only when
they strengthen the shared architecture.

1. No hardcoded styling outside approved token owners.

   - Raw color values, rgba/hsla literals, one-off shadows, one-off spacing,
     one-off radii, and arbitrary Tailwind values must live in semantic tokens
     or approved foundation files.
   - Components and feature CSS must consume ``--ui-*`` tokens, semantic
     component classes, or documented feature tokens.
   - JSX ``style`` props may express runtime state such as CSS variables,
     measured dimensions, drag transforms, or animation duration. They must not
     carry fixed visual design decisions such as colors, spacing, shadows,
     borders, typography, or radius.

2. No override-driven fixes.

   - Do not fix a defect by adding later-loaded CSS that merely wins the
     cascade against the real owner.
   - Do not increase selector specificity to overpower an existing rule.
   - Do not add page-specific selectors for shared chrome such as topbar,
     sticky tabs, sheets, feed list geometry, skeleton chrome, buttons, cards,
     or media controls.
   - If a rule needs to beat another rule, first identify the owner. Move or
     change the rule in that owner instead of adding another layer on top.

3. No temporary CSS architecture.

   - CSS filenames must describe stable ownership, not release pressure.
   - Files or selectors named as ``patch``, ``hotfix``, ``temporary``, ``temp``,
     ``hack``, ``workaround``, ``override``, ``final``, ``polish``,
     ``compat``, ``bridge``, or ``correction`` are not valid architecture.
   - If a release blocker requires a narrow exception, the exception still
     belongs in the correct owner file and must be encoded in a guard before it
     ships.

4. Layers are ownership boundaries.

   - ``foundation`` owns global tokens and base primitives.
   - ``system-core`` owns runtime primitives that must exist before route CSS.
   - ``components`` owns reusable UI components.
   - ``features`` owns page/domain composition only.
   - ``contracts`` owns last-load cross-page invariants only; it must not
     become a page patch bucket.

5. New CSS must be wired through the graph.

   - All CSS must be reachable from ``src/index.css`` through a stable layer
     facade.
   - A CSS file must have exactly one parent import.
   - TS/TSX files must not import CSS directly except ``src/main.tsx`` importing
     ``./index.css``. Low-frequency route-owned bundles may add a narrow,
     guarded exception when this keeps heavy page CSS out of the global first
     paint path. Current exceptions are:
     ``src/features/admin/AdminPage.tsx`` importing ``./AdminDesktop.css``;
     ``src/pages/TuiPlusMobile.tsx`` and
     ``src/pages/TuiPlusLinkEditorMobile.tsx`` importing
     ``@/features/tui-plus/TuiPlusRoute.css``;
     category feed importing ``@/features/category/CategoryFeedRoute.css``;
     post detail importing ``@/features/post-detail/PostDetailRoute.css``;
     message/notification routes importing
     ``@/features/notifications/NotificationsRoute.css``;
     profile/user-space routes importing
     ``@/features/profile/ProfileRoute.css``;
     profile bio editor importing
     ``@/features/profile/ProfileBioEditorRoute.css``;
     post create importing
     ``@/features/post-create/PostCreateRoute.css``;
     promote workspace routes importing
     ``@/features/promote/PromoteRoute.css`` or ``./PromoteRoute.css``;
     sponsor/referral routes importing
     ``@/features/sponsor/ReferralRoute.css`` or ``./SponsorRoute.css``;
     and recharge importing ``@/features/recharge/RechargeRoute.css``.

6. New patterns must come with enforcement.

   - A new token, owner boundary, visual contract, or intentional exception
     must update ``scripts/css-architecture-guards.mjs`` or
     ``scripts/check-ui-hardcoding.mjs`` when the rule can be verified
     automatically.
   - Passing current tests is not enough if the change creates an unguarded
     hardcoded value, late override, or unclear owner boundary.

7. CSS state must be explicit, not inferred from descendant structure.

   - CSS must not use ``:has()`` to detect child markup, sibling adjacency, or
     page composition.
   - Components must expose semantic classes or ``data-*`` state for styling
     decisions that depend on runtime structure, such as expanded content,
     footer-only feeds, thumbnails, route chrome, or follow-up rows.
   - A selector should describe the owned UI state directly. If the selector
     only works because another component happens to render a child in a
     certain order, move that state to the owner before styling it.

8. Token overrides and stale selectors must stay accountable.

   - Duplicate root ``--ui-*`` definitions are valid only when every token is
     recorded in ``scripts/css-token-override-manifest.mjs`` with files,
     direction, and reason.
   - Duplicate non-root selector/property ownership is valid only when the
     overlap is recorded in ``scripts/css-selector-overlap-manifest.mjs`` with
     selector, property, files, and reason.
   - Unused compatibility selectors, abandoned variant names, and historical
     CSS memories must be removed when their owner is touched. Do not keep dead
     selectors as documentation.
   - If a selector remains for a product state that is not obvious from current
     markup, add an architecture guard or move the state into the component
     owner so the relationship is testable.

Responsive Architecture Rules
-----------------------------

1. Use one codebase for H5 and PC.

   - Do not split H5 and PC into separate page implementations.
   - Page markup must describe product structure, not viewport-specific layout hacks.
   - Responsive behavior must be expressed through Tailwind responsive prefixes, semantic CSS classes, or media queries inside the owned CSS layer.

2. Mobile-first is mandatory.

   - Default styles target H5.
   - Tablet and PC styles are progressive enhancements at ``md`` / ``lg`` breakpoints.
   - PC-specific layout must not leak back into mobile base rules.

3. PC layout must use shared axes and tokens.

   - Topbar, tabs, main content, empty states, loading states, and feed lists must align to shared container tokens.
   - Do not let each module define its own unrelated ``max-width`` or horizontal padding.
   - If a new PC width, page gutter, feed width, or shell width is needed, define a semantic token first and consume that token everywhere.

4. Hardcoded responsive values are not allowed.

   - Do not scatter raw values such as ``760px``, ``34px``, ``12px``, ``max-w-2xl``, ``h-40``, or icon ``size`` / ``strokeWidth`` props in page/component code.
   - Raw design values belong in ``00-tokens.css`` or an approved foundation layer.
   - Component and feature CSS should consume semantic tokens such as page width, feed width, control size, avatar size, spacing, radius, typography, shadow, and motion tokens.

5. CSS ownership must stay clear.

   - Global tokens define design decisions.
   - Foundation and primitives define reusable behavior.
   - Component CSS owns reusable UI components such as cards, topbars, buttons, sheets, and media blocks.
   - Feature CSS owns page composition only.
   - Feature CSS must not permanently override shared components with high-specificity patches.

6. Homepage is the reference implementation.

   - Homepage UI/CSS decisions should become reusable standards before being copied to other pages.
   - If a homepage rule is expected to apply elsewhere later, promote it into tokens, primitives, or component CSS instead of leaving it as a local exception.
   - Homepage PC adaptation must set the pattern for future pages: shared shell, shared content axis, tokenized feed width, tokenized gutters, and mobile-first responsive enhancement.

Deprecated Patterns
-------------------

The following patterns may still exist in legacy CSS, but they are not allowed as new standards and must not be copied:

1. Page-only CSS patches.

   - Do not add temporary page patches to compensate for unclear component ownership.
   - Do not create ``final``, ``fix``, ``patch``, ``guard``, or ``v2`` style files as a normal path.
   - If a patch is unavoidable for a release blocker, it must include a follow-up cleanup target and must not become the reference implementation.

2. High-specificity overrides.

   - Do not solve new UI issues with ``!important``.
   - Do not stack selectors to overpower old CSS.
   - Do not force a shared component from a feature stylesheet unless the feature owns that component boundary.

3. Raw visual constants outside tokens.

   - Do not copy legacy raw values from existing CSS.
   - Existing raw values are technical debt, not precedent.
   - When touching a legacy block, prefer converting repeated raw values into semantic tokens or component classes.

4. One-off responsive fixes.

   - Do not fix PC by adding isolated ``max-width`` rules to individual modules.
   - Do not fix mobile by forcing heights, icon sizes, or negative spacing in JSX.
   - Responsive fixes must start from shell, container, and component ownership before local details.

5. Dead memories and stale decisions.

   - Do not preserve old UI decisions once the product direction has moved to the current Instagram-like homepage standard.
   - Do not keep references to abandoned ``V2`` naming, temporary redesign branches, or legacy visual experiments.
   - Remove stale notes when they conflict with token-first, mobile-first, shared-axis frontend architecture.

Visual System Rules
-------------------

Homepage is the first implementation target for the visual system. Typography, color, buttons, surfaces, cards, icons, and interaction states must be standardized while rebuilding homepage, then reused by later pages.

1. Typography system.

   - Font family, size, weight, line-height, letter spacing, and text color must come from semantic typography tokens or semantic component classes.
   - Do not set one-off ``font-size``, ``font-weight``, ``line-height``, or ``letter-spacing`` values inside JSX or page-only CSS unless a token is being created at the same time.
   - Text hierarchy must be explicit:
     ``display`` for brand or major hero identity,
     ``page-title`` for page-level titles,
     ``section-title`` for section titles,
     ``body`` for readable content,
     ``meta`` for timestamps and secondary facts,
     ``caption`` for compact helper text,
     ``label`` for controls and tabs.
   - Font weight must communicate hierarchy, not decoration. Names, titles, selected tabs, primary actions, and important metrics may use strong/title weights; timestamps, sources, captions, and muted facts must use body/medium weights.
   - Body copy must prioritize readability: stable line-height, no compressed tracking, no arbitrary truncation unless the component owns that behavior.
   - Homepage post cards are the reference for feed typography: author name, timestamp, body text, tags, source line, action counts, and comment preview must become the reusable feed text hierarchy.

2. Color system.

   - Raw colors must live in tokens. Component and feature CSS must consume semantic colors such as page surface, card surface, text strong, text muted, divider, action, danger, success, brand, and selected state.
   - Do not use Tailwind palette colors, hex values, rgba literals, or opacity color suffixes directly in JSX.
   - Color must communicate role:
     primary text for content,
     muted text for metadata,
     brand/action for primary actions,
     danger for destructive or like emphasis,
     success for online/available status,
     divider/border for separation only.
   - Homepage Instagram-like direction uses restrained monochrome surfaces, subtle dividers, and small semantic accent moments. Do not introduce unrelated colorful accents per component.
   - Existing raw color values in old CSS are technical debt, not precedent.

3. Surface, border, radius, and shadow system.

   - Page background, topbar, tabs, cards, sheets, popovers, media blocks, and floating actions must use semantic surface tokens.
   - Radius must come from the radius scale. Do not invent one-off rounded values.
   - Shadows must come from semantic elevation tokens. Do not add ad hoc box-shadow values for a single page.
   - Borders and dividers should be subtle and role-based: content separation, card boundary, focus ring, selected state, or sheet boundary.
   - Homepage feed card is the reference for social card surface: mobile edge-to-edge, PC elevated card, consistent divider and radius behavior.

4. Button and control system.

   - Buttons must use stable variants: primary, brand, ghost, muted, danger, icon, floating, and compact.
   - Button size, padding, radius, font, icon size, gap, hover, focus, active, disabled, and loading states must be tokenized.
   - Do not define button visuals inside page JSX.
   - Icon-only buttons must have accessible labels and a predictable hit target.
   - Homepage topbar publish button, profile button, feed actions, floating dock actions, and manager confirm button are the first controls to align to this system.

5. Icon system.

   - Icon size, stroke width, color, and alignment must be controlled by semantic classes or component CSS.
   - Do not scatter Lucide ``size`` / ``strokeWidth`` props through page code for visual tuning.
   - Icons must match the component role: action icons, metadata icons, status icons, navigation icons, and decorative icons have different optical weights and spacing.
   - Feed card actions are the reference for social action icon scale and baseline alignment.

6. State and interaction system.

   - Hover, focus-visible, active, selected, disabled, loading, empty, and error states must be defined at the component or primitive level.
   - Focus states are required for clickable brand text, buttons, tabs, cards, and sheet controls.
   - Motion must use motion tokens and must communicate press, reveal, refresh, or hierarchy. Do not add decorative motion without product purpose.
   - Responsive states must not be hardcoded per viewport. They must flow from shell, container, and component tokens.

7. Homepage implementation requirement.

   - When improving homepage, first ask whether the change belongs to typography, color, surface, button, icon, state, or layout tokens.
   - If yes, update the token/foundation/component layer first, then consume it in homepage.
   - Homepage-specific CSS is allowed only for composition and page rhythm. Reusable visual decisions must not remain trapped in homepage CSS.
   - Any homepage visual decision expected to apply to other pages must be named as a reusable standard before rollout.

Social Feed Visual Standard
---------------------------

The homepage feed is the product reference for a restrained, image-led social timeline. It should feel as precise and mature as leading consumer social products without copying any third-party brand assets or proprietary trade dress.

1. Typography density.

   - The global sans stack prioritizes native Apple and Chinese system fonts, then common platform fallbacks.
   - Feed text uses a compact but readable hierarchy: author name, body text, metadata, tags, action counts, source, and comment preview each consume semantic feed typography tokens.
   - Author names and selected states use title/strong weights. Timestamps, source text, tags, and action counts stay medium or muted so content and media remain primary.
   - Body copy must use readable line-height and should not be compressed just because a post includes media.

2. Card rhythm.

   - Mobile feed cards are edge-to-edge with subtle separators; PC feed cards may use the shared card surface, radius, border, and shadow tokens.
   - The author block, body, tags, media, source, actions, and comments must follow one tokenized vertical rhythm.
   - Refresh indicators, update dots, and tab affordances must not reserve extra layout space that breaks visual balance.

3. Media and actions.

   - Post media is the visual anchor and should read as full-width inside the card's content model.
   - Action buttons use one shared icon size, hit target, count typography, hover/focus/active behavior, and no click shadow.
   - Action count text is secondary information and must not overpower body copy.

4. Alignment.

   - Body text, tags, source line, actions, and comment preview must align to the same content axis unless the component explicitly owns an intentional optical offset.
   - Tags are text-like metadata, not pills by default; do not add borders or chip padding that makes them visually drift from the body copy.
