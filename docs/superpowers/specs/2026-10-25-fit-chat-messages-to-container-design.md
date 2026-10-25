# Fit chat messages to the available chat width

## Intent

On narrow screens and narrow chat panes, message bubbles and media should fit the space available to the conversation. Keep message text at its current size.

## Goals

- Constrain message bubbles, photos, albums, video, and document previews to the chat message area's available inline width.
- Preserve existing desktop sizing when the chat area has enough room.
- Keep the adjustment in CSS and avoid changing message content or player behavior.

## Non-goals

- Shrink message text, controls, or unrelated chat chrome.
- Change the maximum media size for wide chat areas.

## Constraints

- The frontend already has multiple breakpoint rules for message bubbles and media, including web-only width caps. Later rules can override earlier mobile limits.
- The available chat column can be narrower than the viewport, so viewport width alone is not a reliable sizing basis.
- Add a focused CSS regression test for container-aware sizing and verify the frontend checks required by the repository workflow.

## Approaches

1. **Viewport breakpoints:** add smaller caps under existing mobile breakpoints. This is simple, but does not account for a narrow chat column inside a wider viewport.
2. **Available chat width (selected):** express bubble and media widths as constrained to the chat message area's available inline size, retaining current caps for wider layouts. This directly addresses narrow panes and avoids changing text size.

## Test plan

- Add CSS-level assertions that media and bubbles cannot exceed the available chat width, while existing text sizing remains unchanged.
- Run the focused frontend style tests, then the frontend test, lint, and build commands required by the feature workflow.

## Implementation decisions

- Use CSS constraints scoped to the conversation message area; retain existing roomy desktop caps.
- Cover standalone images, albums, videos, and document previews so each attachment type follows the same available-width rule.
