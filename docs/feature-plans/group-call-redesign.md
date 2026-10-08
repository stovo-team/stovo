# Group call presentation redesign

## User problem

The group-call popup overemphasizes participant tiles, makes the shared presentation too wide or too small, and uses oversized controls. When sharing begins, the meeting should foreground the presentation and give participants compact, consistently sized tiles.

## Scope and observable behavior

- Keep the shared presentation as the primary stage at 16:9, contained without stretching.
- Show participant tiles at 16:9 in a compact right rail when there is enough width, and as a compact row along the bottom when the viewport is narrow.
- Expand desktop group calls to the full-screen call surface while local or remote screen sharing is active.
- Use a compact standard popup for an idle/first-time group call and reduce invite and call-control button sizes.
- Keep call settings above the call surface and retain the audio-channel settings presentation.

## Constraints and decisions

- Preserve existing media streams, participant ordering, speaking indicators, and mobile call UI.
- Apply the auto-full-screen behavior only to group calls while screen sharing is active; users can still minimize the call.
- Use CSS grid/flex breakpoints so the participant rail changes to a bottom row before the presentation becomes too narrow.
- Keep all existing call settings components and state handling; this change only ensures their overlay order remains above the expanded call.
