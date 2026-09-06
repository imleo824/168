export const allowedSelectorPropertyOverlapManifests = [
  {
    selector: ":is(.profile-modern-page, .user-space-page-next) :is(.profile-avatar-button, .user-space-avatar-next)",
    files: [
      "src/styles/features/profile-shared-avatar-stroke.css",
      "src/styles/features/profile-shared-avatar.css",
    ],
    properties: ["--ui-profile-avatar-ring-width", "background", "box-shadow", "overflow", "padding"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ":is(.profile-modern-page, .user-space-page-next) :is(.profile-identity-copy, .user-space-profile-copy)",
    files: [
      "src/styles/features/profile-plus-visual.css",
      "src/styles/features/profile-shared-bio.css",
    ],
    properties: ["gap", "margin-top"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ":is(.profile-modern-page, .user-space-page-next) :is(.profile-name-mobile, .profile-name-desktop, .user-space-name-mobile, .user-space-name-desktop)",
    files: [
      "src/styles/features/profile-plus-visual.css",
      "src/styles/features/profile-shared-bio.css",
    ],
    property: "line-height",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ":is(.profile-modern-page, .user-space-page-next) .profile-bio-edit-icon",
    files: [
      "src/styles/features/profile-plus-visual.css",
      "src/styles/features/profile-shared-bio.css",
    ],
    property: "margin-left",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".admin-chat-config-header",
    files: [
      "src/styles/features/admin/admin-filters-responsive.css",
      "src/styles/features/admin/admin-workflows.css",
    ],
    property: "flex-direction",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".admin-config-surface--comfortable",
    files: [
      "src/styles/features/admin/admin-primitives.css",
      "src/styles/features/admin/admin-shell.css",
    ],
    property: "padding",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".admin-mobile-topbar",
    files: [
      "src/styles/features/admin/admin-filters-responsive.css",
      "src/styles/features/admin/admin-shell.css",
    ],
    property: "align-items",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".admin-pagination-bar",
    files: [
      "src/styles/features/admin/admin-filters-responsive.css",
      "src/styles/features/admin/admin-tables-pagination.css",
    ],
    property: "flex-direction",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".admin-pagination-controls",
    files: [
      "src/styles/features/admin/admin-filters-responsive.css",
      "src/styles/features/admin/admin-tables-pagination.css",
    ],
    properties: ["justify-content", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".admin-section-card",
    files: [
      "src/styles/features/admin/admin-filters-responsive.css",
      "src/styles/features/admin/admin-workflows.css",
    ],
    property: "padding",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".admin-sidebar",
    files: [
      "src/styles/features/admin/admin-filters-responsive.css",
      "src/styles/features/admin/admin-shell.css",
    ],
    property: "display",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".admin-system-config-tabs",
    files: [
      "src/styles/features/admin/admin-filters-responsive.css",
      "src/styles/features/admin/admin-workflows.css",
    ],
    property: "grid-template-columns",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".admin-table-width",
    files: [
      "src/styles/features/admin/admin-filters-responsive.css",
      "src/styles/features/admin/admin-primitives.css",
    ],
    property: "min-width",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".empty-state-card .ui-state-icon",
    files: [
      "src/styles/components/state-contract.css",
      "src/styles/system/ui-primitives-feedback.css",
    ],
    properties: ["background", "color"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".feed-card-options-sheet-actions",
    files: [
      "src/styles/components/feed-card-options-menu.css",
      "src/styles/components/feed-card-shell.css",
    ],
    properties: ["display", "gap"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ins-post-card .feed-card-anonymous-try-button",
    files: [
      "src/styles/components/feed-card-anonymous.css",
      "src/styles/components/feed-card-shell.css",
    ],
    properties: ["flex", "min-height", "min-width", "white-space"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ins-post-card",
    files: [
      "src/styles/components/feed-card-responsive.css",
      "src/styles/components/feed-card-shell.css",
    ],
    properties: ["--feed-card-action-size", "--feed-card-author-avatar-size", "--feed-card-author-row-gap", "--feed-card-author-row-padding-x", "--feed-card-layout-padding-bottom", "--feed-card-layout-padding-x", "--feed-card-layout-padding-y"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".post-create-category-grid",
    files: [
      "src/styles/features/create-promote-post-settings.css",
      "src/styles/features/create-promote-responsive.css",
    ],
    property: "grid-template-columns",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".post-create-page .image-upload--field .image-upload-grid",
    files: [
      "src/styles/features/create-promote-post-editor.css",
      "src/styles/features/create-promote-post-media-grid.css",
    ],
    properties: ["align-items", "display", "gap", "grid-template-columns", "justify-content"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".post-create-submit-label",
    files: [
      "src/styles/features/create-promote-post-editor.css",
      "src/styles/features/create-promote-submit.css",
    ],
    properties: ["min-width", "white-space"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-contact-field",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["align-items", "display", "gap"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-contact-input",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["background", "border", "color", "font-size", "font-weight", "min-width", "outline"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-contact-prefix",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["color", "font-size", "font-weight", "line-height"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-description",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["color", "line-height", "margin"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-field-error",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["color", "font-size", "line-height"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-field-label",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["color", "font-size", "font-weight", "line-height"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-field-stack",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["display", "gap"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-field, .profile-dialog-contact-field",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["background", "border", "border-radius", "color", "transition", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-field",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    property: "padding",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-header",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["align-items", "background", "border-bottom", "display", "gap", "grid-template-columns"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-overlay.is-scrollable",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    property: "align-items",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-overlay",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["align-items", "display", "inset", "isolation", "justify-content", "padding", "padding-inline", "position", "z-index"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-panel",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["background", "border", "border-radius", "box-shadow", "max-height", "overflow", "position", "width", "z-index"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-dialog-scrim",
    files: [
      "src/styles/components/profile-dialog.css",
      "src/styles/features/profile-dialog.css",
    ],
    properties: ["background", "border", "inset", "position"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".profile-tui-plus-chip-icon",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["color", "flex", "height", "stroke-width", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".topbar-icon-button:not(.ui-topbar-back-button):hover, .ui-topbar :is(.ui-topbar-publish-btn):hover",
    files: [
      "src/styles/components/topbar-tactile.css",
      "src/styles/components/topbar.css",
    ],
    property: "background",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-card",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["background", "border", "box-shadow", "display", "gap", "padding"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-field input:focus",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["background", "border-color", "box-shadow"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-field input",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["background", "border", "border-radius", "color", "font-size", "min-height", "outline", "padding", "scroll-margin-block", "touch-action", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-field span",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["color", "font-size", "font-weight"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-field",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["display", "gap"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-section-header span",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["color", "font-size", "white-space"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-section-header strong",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["color", "font-size", "font-weight"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-section-header",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["align-items", "display", "gap", "justify-content", "min-width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-section",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["background", "border", "border-radius", "display", "gap", "padding"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-slot-fields",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["display", "gap"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-slot-index",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["align-items", "background", "border-radius", "box-shadow", "color", "display", "font-size", "font-weight", "height", "justify-content", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-slot",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["align-items", "display", "gap", "grid-template-columns"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-link-editor-slots",
    files: [
      "src/styles/features/tui-plus-visual.css",
      "src/styles/features/user-space-actions.css",
    ],
    properties: ["display", "gap"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-page, .tui-plus-link-editor-page",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    property: "background",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-plan-card-badge",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    properties: ["align-self", "border-radius", "grid-area", "justify-self", "line-height"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-plan-card-body",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    properties: ["gap", "grid-area", "justify-self", "min-width", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-plan-card-mark",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    properties: ["height", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-plan-card-meta",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    properties: ["display", "font-size", "gap"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-plan-card-price b",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    property: "font-size",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-plan-card-price",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    property: "gap",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-plan-card-radio",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    properties: ["align-self", "grid-area", "justify-self"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-plan-card-top strong",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    properties: ["font-size", "min-width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-plan-card-top",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    properties: ["align-items", "display", "gap", "min-width", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-plan-card",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    properties: ["align-items", "background", "border-radius", "box-shadow", "display", "gap", "grid-template-areas", "grid-template-columns", "padding", "position"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-plan-pair",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    properties: ["display", "gap", "grid-template-columns"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-action-row",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["display", "gap", "grid-template-columns"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-action, .tui-plus-x-primary, .tui-plus-link-editor-save",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["box-shadow", "justify-content", "min-height", "min-width", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-benefit-icon svg, .tui-plus-x-benefit-item h3 svg",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["height", "stroke-width", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-benefit-icon",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    property: "background",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-benefit-icon",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["align-items", "border-radius", "color", "display", "height", "justify-content", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-benefit-item h3 svg",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    property: "color",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-benefit-item",
    files: [
      "src/styles/features/profile-plus-visual.css",
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    property: "align-items",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-benefit-item",
    files: [
      "src/styles/features/profile-plus-visual.css",
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["display", "gap", "grid-template-columns"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-benefit-item",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["background", "border", "border-radius", "padding"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-benefit-list",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-premium-layout.css",
    ],
    property: "gap",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-benefits h2",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["color", "font-size", "font-weight"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-benefits",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["background", "box-shadow"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-brand-row",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["align-items", "gap"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-eyebrow",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["color", "font-size", "font-weight", "letter-spacing"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-hero h1",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["color", "font-size", "font-weight", "line-height"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-hero::before",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["background", "content", "inset", "pointer-events", "position"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-hero",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    property: "padding",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-hero",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["display", "gap", "overflow", "position"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-hero",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["background", "box-shadow"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-mark svg",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["height", "stroke-width", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-mark",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["box-shadow", "height", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-mark",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["align-items", "background", "border-radius", "color", "display", "justify-content"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-points-price",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["align-items", "background", "border", "border-radius", "color", "display", "font-size", "font-weight", "line-height", "padding", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-status",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["color", "font-size", "font-weight", "line-height"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-title-stack .tui-plus-x-status",
    files: [
      "src/styles/features/tui-plus-premium-layout.css",
      "src/styles/features/tui-plus-request-fixes.css",
    ],
    properties: ["max-width", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-toggle button[data-state='active']",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["background", "box-shadow", "color"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-toggle button",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["align-items", "background", "border", "border-radius", "color", "display", "font-size", "font-weight", "gap", "justify-content", "min-height"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-toggle span",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["color", "font-size"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".tui-plus-x-toggle",
    files: [
      "src/styles/features/tui-plus-mobile.css",
      "src/styles/features/tui-plus-visual.css",
    ],
    properties: ["background", "border-radius", "display", "gap", "grid-template-columns", "padding"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-button[data-action-size='header']",
    files: [
      "src/styles/components/buttons.css",
      "src/styles/system/ui-control-shape-contract.css",
    ],
    properties: ["font-size", "min-height", "padding-inline"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-button[data-action-size='md']",
    files: [
      "src/styles/components/buttons.css",
      "src/styles/system/ui-control-shape-contract.css",
    ],
    properties: ["min-height", "padding-inline"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-button[data-action-size='sm']",
    files: [
      "src/styles/components/buttons.css",
      "src/styles/system/ui-control-shape-contract.css",
    ],
    properties: ["font-size", "min-height", "padding-inline"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-button[data-action-variant='muted']",
    files: [
      "src/styles/components/buttons.css",
      "src/styles/system/ui-foundation-clean.css",
    ],
    properties: ["background", "color"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-button[data-action-variant='success']",
    files: [
      "src/styles/components/buttons.css",
      "src/styles/system/ui-control-shape-contract.css",
    ],
    properties: ["background", "color"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-button",
    files: [
      "src/styles/components/buttons.css",
      "src/styles/system/ui-foundation-clean.css",
    ],
    properties: ["align-items", "border-radius", "display", "font-weight", "gap", "justify-content", "line-height", "transition"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-feed-footer-state",
    files: [
      "src/styles/02-core-controls.css",
      "src/styles/features/home-feed-state.css",
    ],
    properties: ["background", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-feed-plain-state-action",
    files: [
      "src/styles/components/state-contract.css",
      "src/styles/features/home-feed-state.css",
    ],
    properties: ["align-items", "background", "border", "border-radius", "color", "display", "font-size", "font-weight", "justify-content", "line-height", "min-height"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-feed-plain-state-copy",
    files: [
      "src/styles/components/state-contract.css",
      "src/styles/features/home-feed-state.css",
    ],
    properties: ["align-items", "display", "flex-direction", "gap", "justify-content", "min-width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-feed-plain-state-subtext",
    files: [
      "src/styles/components/state-contract.css",
      "src/styles/features/home-feed-state.css",
    ],
    properties: ["color", "font-size", "font-weight"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-feed-plain-state",
    files: [
      "src/styles/components/state-contract.css",
      "src/styles/features/home-feed-state.css",
    ],
    properties: ["align-items", "display", "gap", "justify-content", "min-height", "padding", "text-align", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-list-loadmore",
    files: [
      "src/styles/02-core-controls.css",
      "src/styles/components/state-contract.css",
    ],
    properties: ["align-items", "color", "display", "justify-content", "min-height", "text-align"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-loading-block--compact",
    files: [
      "src/styles/02-core-controls.css",
      "src/styles/components/state-contract.css",
    ],
    property: "min-height",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-loading-block",
    files: [
      "src/styles/02-core-controls.css",
      "src/styles/components/state-contract.css",
    ],
    properties: ["align-items", "color", "display", "gap", "justify-content", "min-height", "padding", "text-align"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-loading-text",
    files: [
      "src/styles/02-core-controls.css",
      "src/styles/components/state-contract.css",
    ],
    properties: ["color", "font-size", "line-height", "margin"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-page-loader",
    files: [
      "src/styles/system/ui-primitives-layout.css",
      "src/styles/system/ui-primitives-responsive.css",
    ],
    property: "padding-block",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-refresh-hint",
    files: [
      "src/styles/02-core-controls.css",
      "src/styles/components/state-contract.css",
    ],
    properties: ["-webkit-backdrop-filter", "align-items", "backdrop-filter", "background", "border", "border-radius", "color", "display", "gap", "justify-content", "min-height", "padding-inline"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-route-overlay",
    files: [
      "src/styles/system/ui-primitives-layout.css",
      "src/styles/utilities/mobile-overlay-stability.css",
    ],
    properties: ["background", "overflow-y", "overscroll-behavior"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-segment-tab",
    files: [
      "src/styles/system/ui-primitives-interactions.css",
      "src/styles/system/ui-primitives-responsive.css",
    ],
    properties: ["font-size", "min-height"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-state-actions",
    files: [
      "src/styles/02-core-controls.css",
      "src/styles/components/state-contract.css",
    ],
    properties: ["align-items", "display", "flex-wrap", "gap", "justify-content"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-state-icon",
    files: [
      "src/styles/02-core-controls.css",
      "src/styles/components/state-contract.css",
    ],
    properties: ["align-items", "background", "border-radius", "color", "display", "height", "justify-content", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-topbar-back-button .ui-topbar-back-icon",
    files: [
      "src/styles/components/topbar-leading-contract.css",
      "src/styles/components/topbar.css",
    ],
    property: "transform",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-topbar-back-button, .topbar-icon-button, .ui-topbar :is(.ui-topbar-publish-btn)",
    files: [
      "src/styles/components/topbar-tactile.css",
      "src/styles/components/topbar.css",
    ],
    property: "transition",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-topbar-back-button:hover",
    files: [
      "src/styles/components/topbar-tactile.css",
      "src/styles/components/topbar.css",
    ],
    property: "background",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-topbar-back-icon, .topbar-icon-button :is(svg), .ui-topbar :is(.ui-topbar-publish-btn) :is(svg)",
    files: [
      "src/styles/components/topbar-tactile.css",
      "src/styles/components/topbar.css",
    ],
    property: "stroke-width",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-topbar-inner",
    files: [
      "src/styles/components/topbar-leading-contract.css",
      "src/styles/components/topbar.css",
    ],
    property: "padding-inline",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-topbar-title",
    files: [
      "src/styles/components/topbar-tactile.css",
      "src/styles/components/topbar.css",
    ],
    property: "letter-spacing",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".ui-topbar[data-leading-kind='default-back'] .ui-topbar-leading-slot",
    files: [
      "src/styles/components/topbar-leading-contract.css",
      "src/styles/components/topbar.css",
    ],
    properties: ["max-width", "min-width", "overflow", "width"],
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: "100%",
    files: [
      "src/styles/components/feed-card-actions-layout-v2.css",
      "src/styles/components/feed-follow-interaction.css",
    ],
    property: "transform",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: "from",
    files: [
      "src/styles/features/home-motion.css",
      "src/styles/utilities/motion-scroll.css",
    ],
    property: "transform",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: "to",
    files: [
      "src/styles/features/home-motion.css",
      "src/styles/system/ui-primitives-feedback.css",
      "src/styles/system/ui-skeleton-primitives.css",
      "src/styles/utilities/motion-scroll.css",
    ],
    property: "transform",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: "to",
    files: [
      "src/styles/system/ui-skeleton-primitives.css",
      "src/styles/utilities/motion-scroll.css",
    ],
    property: "opacity",
    reason: "Current CSS architecture intentionally splits this selector across these owner files; this manifest keeps the overlap explicit and stale-checked.",
  },
  {
    selector: ".home-page-skeleton .home-topbar .ui-profile-icon-button::before",
    files: [
      "src/styles/system/ui-skeleton-chrome-contract.css",
      "src/styles/system/ui-skeleton-home.css",
    ],
    properties: ["animation", "opacity", "transform"],
    reason: "The home skeleton topbar uses the shared skeleton chrome shimmer while the home skeleton facade owns the route-specific avatar placeholder.",
  },
];
