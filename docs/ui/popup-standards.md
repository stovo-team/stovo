# Popup UI standards

Use the shared popup primitives for dialogs, modal sheets, popup forms, and custom dropdowns. New popup work and popup migrations must use these components instead of adding local overlay, surface, close, button, field, or dropdown styles.

## Shared visual contract

| Element | Standard |
| --- | --- |
| Backdrop | `PopupBackdrop`, black at 56% opacity (`rgba(0, 0, 0, 0.56)`), with no blur. |
| Dialog surface | `PopupDialog`, theme-aware surface and border, 24px radius, soft shadow, 24px default padding. |
| Close action | `PopupCloseButton`, 34px gray circle with a regular white 18px X and an accessible label. |
| Primary action | `PopupButton variant="primary"`, accent fill and contrasting text. |
| Secondary action | `PopupButton variant="secondary"`, neutral outline and primary text. Use for cancel and neutral actions. |
| Destructive action | `PopupButton variant="danger"`, danger border and text with a lightly tinted hover state. |
| All action buttons | Exactly 44px high with a pill radius, including destructive actions. |
| Text input | `PopupField`, 46px high with a pill radius, theme surface and shared focus ring. |
| Dropdown | `PopupSelect`, 46px pill trigger, one trailing 16px Lucide chevron, 18px menu, rounded rows, no pointer triangle or decorative separators. |
| Typography | Use `--font-family-ui` from `tokens.css`; use `--font-family-mono` only for code. Titles use `--font-size-heading-small` with `--font-weight-semibold`; body and controls use `--font-size-small`; buttons use `--font-size-button`; helper text uses `--font-size-caption`. Use the shared line-height tokens. |
| Popup grouping | Use spacing and alignment. Do not add decorative horizontal rules between popup header, body, footer, or groups. |

The shared CSS uses existing theme variables for surfaces, borders, text, accents, danger, and focus. Popup typography also uses the shared font family, size, weight, and line-height tokens from `frontend/src/design-system/tokens.css`. Keep those token references when adding popup content; do not hardcode theme palettes or font styles in a caller. Always extend or reuse the existing popup primitives instead of introducing parallel components.

## Imports and examples

```tsx
// Example from frontend/src/features/chats/sidebar/; adjust the relative path for other callers.
import { PopupBackdrop, PopupCloseButton, PopupDialog } from "../../../components/ui/Popup";
import { PopupButton } from "../../../components/ui/PopupButton";
import { PopupField } from "../../../components/ui/PopupField";
import { PopupSelect } from "../../../components/ui/PopupSelect";
```

`PopupDialog` includes the shared backdrop and close action. For a flow that needs an overlay without the centered dialog surface, compose the backdrop and close action directly:

```tsx
<PopupBackdrop>
  <section aria-label="Media preview">
    <PopupCloseButton ariaLabel="Close media preview" onClick={onClose} />
    {/* Keep the viewer's fullscreen geometry. */}
  </section>
</PopupBackdrop>
```

Compose the dialog shell and explicitly preserve that flow's existing dismissal behavior:

```tsx
<PopupDialog
  ariaLabelledBy="rename-title"
  ariaDescribedBy="rename-help"
  onClose={onClose}
  closeOnBackdrop={false}
  closeOnEscape
  size="sm"
>
  <h2 id="rename-title">Rename chat</h2>
  <p id="rename-help">Choose a name for this chat.</p>
  <PopupField label="Chat name" value={name} onChange={(event) => setName(event.target.value)} />
  <div>
    <PopupButton variant="secondary" onClick={onClose}>Cancel</PopupButton>
    <PopupButton variant="primary" onClick={onSave}>Save</PopupButton>
  </div>
</PopupDialog>
```

For compact search rows that already have an accessible name, keep the label associated but visually hidden with `labelHidden`.

Use the same action height for confirmation and deletion:

```tsx
<PopupButton variant="danger" onClick={onDelete}>Delete</PopupButton>
```

For a custom menu, keep values controlled by the caller. The component exposes a listbox trigger and option semantics, supports disabled options, and returns focus after selection or Escape:

```tsx
<label id="device-label">Microphone</label>
<PopupSelect
  labelledBy="device-label"
  options={devices.map((device) => ({ value: device.id, label: device.name, disabled: device.unavailable }))}
  value={deviceId}
  onChange={setDeviceId}
  menuFooter={<button type="button" onClick={refreshDevices}>Refresh devices</button>}
/>
```

`PopupSelect` also accepts `ariaLabel`, `disabled`, `placeholder`, `emptyMessage`, `renderOption`, and `className`. `PopupField` accepts standard input props and a forwarded input ref, plus `helperText` and `error`. `PopupButton` accepts standard button props, a required `variant`, optional `startIcon` and `endIcon`, and a `loading` state that disables the button.

## Accessibility and behavior

- Give each `PopupDialog` an accessible name using `ariaLabel` or `ariaLabelledBy`. Add `ariaDescribedBy` when explanatory text gives the dialog context.
- Keep dismissal explicit: pass the current flow's `closeOnBackdrop` and `closeOnEscape` behavior. Do not change dismissal behavior as part of a visual migration.
- Keep destructive actions visibly distinct and preserve any existing confirmation step.
- Use `PopupField` labels, helper text, and errors instead of placeholder-only labels. Errors are associated with the input and set `aria-invalid`.
- Give each dropdown a name with `ariaLabel` or `labelledBy`. Preserve controlled selected values and disabled states. The shared dropdown supports ArrowUp/ArrowDown, Home/End, Enter/Space, Escape, selected option exposure, and focus return.
- Do not remove meaningful error, selected, loading, or disabled states when removing old popup CSS.
- Do not add a focus trap to `PopupDialog` unless the flow already owns one; the shared shell only supplies dialog semantics.

## Responsive and flow-specific geometry

Use the shared dialog surface and controls for regular dialogs. Full-screen media viewers, mobile bottom sheets, chat details screens, call windows, transcript panes, and floating call stages may retain their established geometry and placement. Apply shared close, button, field, dropdown, typography, and color rules where they fit the interaction. Do not convert a floating call window or full-screen viewer into a centered dialog.

## Migration checklist

1. Find the current dialog name, dismissal behavior, actions, fields, dropdown behavior, and responsive geometry.
2. Replace local popup overlay/surface composition with `PopupDialog` where the flow is a dialog; use `PopupBackdrop` only when the flow needs a shared overlay without the centered surface.
3. Replace local close controls, action buttons, text fields, and custom selects with the corresponding shared primitives.
4. Remove obsolete local radius, overlay, blur, close, button, field, dropdown, pointer-triangle, and separator rules that conflict with this contract.
5. Preserve copy, validation, events, confirmation requirements, keyboard behavior, theme support, and specialized geometry.
6. Add or update tests for the behavior and visible shared contract changed by the migration.

## Component source

- `frontend/src/components/ui/Popup.tsx` and `Popup.css`: backdrop and dialog surface.
- `frontend/src/components/ui/PopupCloseButton.tsx`: shared close action, re-exported from `Popup.tsx`.
- `frontend/src/components/ui/PopupButton.tsx`: primary, secondary, and danger actions.
- `frontend/src/components/ui/PopupField.tsx`: labeled text input, helper, and error states.
- `frontend/src/components/ui/PopupSelect.tsx`: custom listbox dropdown.
