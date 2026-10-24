# Popup Component System Design

## Goal

Give messenger dialogs, modal popups, and anchored dropdowns one reusable visual system. Define the shared elements first, document their required use for agents, then migrate existing popup implementations without changing their product behavior.

## User-approved direction

The user approved the standard preview with one adjustment: all action buttons, including Delete, must have the same exact height. Use the existing Stovo theme and accent tokens, rounded controls, a gray circular close control with a white X, and no decorative separators in popup layouts.

## Scope

### In scope

1. Add reusable popup primitives for the backdrop, dialog surface, close action, action buttons, text fields, and custom dropdowns.
2. Document those primitives and the popup layout rules for agents in `AGENTS.md` and a linked reference page under `docs/`.
3. Migrate existing dialogs, popovers, sheets, pickers, and popup forms from the source inventory in `popup-audit.md` to the shared primitives and tokens.
4. Preserve existing content, event behavior, labels, validation, theme support, responsive behavior, and accessible semantics while changing visual implementation.

### Special geometry

Full-screen media viewers, mobile bottom sheets, chat details screens, call windows, and transcript panes keep their flow-specific geometry. Where they contain popup controls, they use the shared button, close, field, dropdown, typography, and color tokens when those controls fit the interaction. The desktop call window itself is not converted into a centered modal.

### Out of scope

- Restyling non-popup pages or general messenger controls.
- Changing product behavior, copy, validation, navigation, data handling, or confirmation requirements.
- Removing meaningful selected/error/disabled states. Decorative horizontal rules inside popups are replaced with spacing and grouping.

## Shared visual contract

| Element | Required style |
| --- | --- |
| Backdrop | One shared component/token. `rgba(0, 0, 0, 0.56)` in both themes; no backdrop blur. |
| Dialog surface | Theme-aware `--surface-card`, 1px theme border, 24px radius, soft elevation, 24px default inner padding. Size variants may set width and maximum height but not a new surface style. |
| Close action | Shared 34px circle, neutral gray fill, white regular-weight X at 18px, no visible border. Preserve an accessible name and visible keyboard focus. |
| Primary button | Accent fill with accessible text contrast. |
| Secondary button | Neutral outline and primary text; cancel uses this variant. |
| Destructive button | Transparent/neutral fill, danger border and danger text, danger-tinted hover. |
| All action buttons | Exactly 44px high, fully rounded; consistent horizontal padding, font, focus, hover, and disabled treatment. |
| Text input | 46px high, fully rounded, theme surface, neutral 1px border, shared padding and accent focus ring. |
| Dropdown trigger | 46px high and fully rounded; custom trigger with a fixed 16px Lucide `ChevronDown` slot aligned to the trailing edge. Rotate the chevron only while open. Do not rely on inconsistent native arrows in popup dropdowns. |
| Dropdown menu | Theme-aware raised surface, subtle border/elevation, 18px radius, rounded option rows, stable stacking/placement, no decorative separators. Keep a visible selected state. |
| Typography | Existing Inter/system stack. Popup title 20px/26px semibold; body 14px/21px; label 13px/18px medium; helper text 12px/17px. |
| Popup grouping | Use spacing, alignment, and labels. No decorative horizontal rules between header/body/footer or sections. |

Use existing CSS theme variables for light, dark, and AMOLED colors, accent, borders, focus rings, and text. The numeric contract above is shared across themes; no popup should hardcode a different palette.

## Component boundaries and API direction

Create a focused UI primitive folder at `frontend/src/components/ui/`:

- `Popup.tsx` / `Popup.css`: `PopupBackdrop` for the shared overlay and `PopupDialog` for the themed surface/semantics. Keep sizing extensible through named size variants and a caller class for content-specific layout only. The component must not silently change the current close-on-backdrop or Escape behavior of a migrated flow; callers state the existing behavior explicitly.
- `PopupCloseButton.tsx`: one circular close control accepting `onClick`, accessible label, disabled state, and optional class extension for positioning.
- `PopupButton.tsx`: one button component with `variant: "primary" | "secondary" | "danger"`, standard `type`, disabled/loading support only where the caller already has that state, and an optional start/end icon slot.
- `PopupField.tsx`: shared text input styling and label/helper/error layout, forwarding normal input props and refs.
- `PopupSelect.tsx`: controlled option list with trigger, selected value, disabled options, and optional caller-provided list content for current dynamic device/chat choices. Preserve keyboard navigation, focus return, selection semantics, `aria-expanded`, `aria-controls`, `role=listbox`, and `aria-selected` behavior.

Do not add dependencies. Use the existing React, TypeScript, and Lucide dependencies. Keep component styles in the new focused CSS file and add only shared design tokens/base rules to `styles.css` where the app already defines global theme variables.

## Agent documentation

Add `docs/ui/popup-standards.md` with the token table, primitive imports and short examples, supported variants, required accessibility states, responsive exceptions, and migration checklist. Update the root `AGENTS.md` to require these primitives for new popup work and direct agents to the reference page. The guidance must say to reuse the component rather than introduce popup-local radius, overlay, close, button, field, or dropdown styling.

## Migration approach

Migrate in reviewable groups after primitives and documentation exist:

1. Chat create/edit, message forward/delete, composer schedule/reminder, and chat transfer dialogs.
2. General invite, poll, quick switcher, app lock, appearance, plans, admin, and MCP dialogs.
3. Media, attachment, and storage dialogs, pickers, sheets, and viewers; retain full-screen/sheet geometry where required.
4. Call/meeting settings and anchored popovers/dropdowns; retain the floating call stage geometry.

For every migration, remove obsolete popup-local CSS overrides that conflict with the shared contract. Preserve specialized content layouts and assertive `alertdialog` semantics. Do not broaden the change to other pages that happen to share generic button selectors.

## Test plan

- Add component tests for `PopupDialog` rendering/accessible semantics, backdrop dismissal opt-in, and Escape behavior when enabled.
- Add component tests for each `PopupButton` variant and fixed 44px sizing through the CSS style test conventions in this repository.
- Add field style tests for exact height/radius and theme-variable use.
- Add `PopupSelect` interaction tests for open/close, keyboard selection, disabled options, selected state, and focus return.
- Add a popup primitive stylesheet contract test that rejects per-variant height/radius drift and blur on the shared backdrop.
- Update existing tests for migrated dialogs where they currently assert obsolete class names or styling; retain all behavioral assertions.
- Run focused component/style tests for each group, then `npm test`, `npm run lint`, and `npm run build` in `frontend`, following `CONTRIBUTING.md`.
- Visually inspect representative desktop and mobile popup states in the running frontend after implementation. A source-only CSS assertion is not a substitute for this review.

## Acceptance criteria

- New popups can be assembled from the shared shell and control primitives without popup-specific control styling.
- The shared backdrop is black at 56% opacity and has no blur.
- All popup action buttons have exactly 44px height and pill radius; Delete follows the same sizing.
- Popup inputs and dropdown triggers have exactly 46px height and pill radius; dropdowns use one chevron implementation and one menu style.
- Popup close actions use the same 34px gray circle and white 18px X.
- Popup surface radius and theme colors are consistent; internal decorative separators are absent.
- Existing popup actions, validation, labels, keyboard interactions, mobile treatment, and theme behavior remain intact.
- `AGENTS.md` points agents to the new standard and explicitly requires reuse.
- Focused tests, frontend tests, lint, build, and representative visual checks pass.
