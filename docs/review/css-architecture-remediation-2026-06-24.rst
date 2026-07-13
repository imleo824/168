CSS Architecture Remediation - 2026-06-24
=========================================

Scope
-----

This records the non-temporary CSS architecture remediation applied after the
current worktree audit. The goal was to move rules back to their real owners,
remove duplicate ownership, and strengthen guards so the same problems cannot
return through late overrides or compatibility aliases.

Final Baseline
--------------

- CSS files under ``src/styles``: 123.
- CSS lines under ``src/styles``: 16580.
- Duplicate root ``--ui-*`` token names: 153.
- Duplicate scoped ``--ui-*`` token names: 20.
- Selector/property overlaps: 225, down from 277.
- Broad ``[class*=...]`` selectors: 0.
- ``:has()`` selectors: 12, down from 13.
- Selected P1 overlap groups remaining: 0 for error boundary, sheet chrome,
  Home mobile feed panel, promote keyboard/layout, and chat post preview.

Resolved Architecture Issues
----------------------------

1. Chat CSS owner split
~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/features/chat.css`` is now a facade. The previous large feature
file was split into focused owners:

- ``chat-tokens.css``
- ``chat-shell.css``
- ``chat-stream.css``
- ``chat-messages.css``
- ``chat-post-preview.css``
- ``chat-composer.css``
- ``chat-rules.css``

The post image preview now owns its CSS in ``chat-post-preview.css`` and uses
semantic chat tokens from ``chat-tokens.css``. Runtime single-image aspect
ratio remains inline because it is image data, not a design constant.

2. Foundation alias cleanup
~~~~~~~~~~~~~~~~~~~~~~~~~~~

The unused compatibility aliases ``--ui-font-weight-bold`` and
``--ui-text-lg`` were removed from ``src/styles/tokens/foundation.css``.

The architecture guard now blocks those aliases from returning. Callers must
use canonical typography tokens such as ``--ui-font-weight-display``,
``--ui-font-weight-strong``, ``--ui-text-title``, or ``--ui-text-xl``.

3. Error boundary single owner
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``.ui-error-boundary`` is now owned by
``src/styles/system/ui-error-boundary-contract.css`` only.

Duplicate declarations were removed from
``src/styles/system/ui-primitives-feedback.css``. The architecture guard now
fails if feedback primitives style ``.ui-error-boundary`` again.

4. Sheet chrome single owner
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Shared sheet chrome is now owned by
``src/styles/02-core-sheets-actions.css``:

- ``.ui-sheet``
- ``.ui-sheet-overlay``
- overlay z-index variants
- ``.ui-sheet-panel``
- ``.ui-sheet-header``
- header row/title/close action
- ``.ui-sheet-handle``
- sheet responsive overlay/header adjustments

Duplicate sheet declarations were removed from:

- ``src/styles/system/ui-primitives-layout.css``
- ``src/styles/system/ui-foundation-clean.css``
- ``src/styles/system/ui-primitives-responsive.css``
- ``src/styles/system/ui-primitives-feedback.css``

The architecture guard now blocks these files from reclaiming sheet chrome.

5. Promote keyboard owner cleanup
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``src/styles/features/create-promote-keyboard.css`` now only owns keyboard,
focus, viewport, and mobile input behavior.

Promote chip overflow rules were moved to
``src/styles/features/promote-layout-choices.css``. Promote calendar sizing and
text overflow rules were moved to
``src/styles/features/promote-layout-calendar.css``.

The architecture guard now fails if keyboard CSS styles promote chips or
calendar layout again.

6. Home first-paint contract clarified
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The Home mobile first-paint contract remains in ``system-core`` because it is
an early-load layout contract, but duplicate layout declarations were removed
from ``src/styles/features/home-feed-foundation.css``.

The previous ``:has(.home-country-stories-shell)`` structure detection was
replaced with the explicit shell state class ``home-has-country-stories`` from
``src/features/home/homeLayout.ts``.

The architecture guard now requires this explicit state and blocks the old
``:has()`` composition detection from returning.

7. Guard coverage expanded
~~~~~~~~~~~~~~~~~~~~~~~~~~

``scripts/css-architecture-guards.mjs`` now protects:

- Chat facade import order.
- No foundation compatibility typography aliases.
- Error boundary single owner.
- Sheet chrome single owner.
- Promote keyboard owner boundary.
- Chat post preview width token ownership.
- Home first-paint explicit shell state.

``scripts/check-ui-hardcoding.mjs`` now checks all chat owner files instead of
the old monolithic ``chat.css`` file.

Verification
------------

All required checks passed after remediation:

- ``npm run test:css-syntax``
- ``npm run test:css-architecture``
- ``npm run lint:ui-hardcoding``
- ``node scripts/overlay-guards.mjs``
- ``npm run lint``
- ``npm run build``
- ``npm run test``

Remaining Non-P1 Debt
---------------------

- Duplicate root token count is still 153. This is currently governed by
  allowed owner pairs, but the next durable improvement is a per-token override
  manifest with owner, direction, and reason.
- Some ``:has()`` selectors remain in topbar/sticky/detail contracts. They are
  outside this remediation batch and should be converted to explicit component
  state where React already knows the condition.
- Admin remains outside the strict UI hardcoding guard. That exception should
  stay explicit, or Admin should be brought under the same product UI contract.
