# Message receipts and origins

## Scope

Refine chat-message presentation without changing the message or delivery-event data model.

## Receipt metadata

Outgoing messages display a single, icon-only receipt state based on the most advanced status recorded for any recipient:

- sent: one check mark;
- delivered: two muted check marks;
- read: two white check marks.

The textual `Delivered` and `Read` labels are removed. Incoming messages retain their timestamp without an outgoing receipt icon.

## Reply and forwarded origin card

A reply or forwarded origin is rendered as a compact inset card at the top-left of its containing message bubble. The card is visually darker than the bubble, with rounded corners and a restrained source label. It is not a block quote.

The source display name is an accessible link. Activating it opens the source direct message when the origin identifies a user, or the source group/channel when it identifies a chat. If the source is unavailable, it remains plain text.

## Implementation boundaries

The React message renderer derives presentation from existing `statuses`, `replyToMessageId`, and `forwardedFrom` data. Navigation uses the existing chat-selection mechanism. Styles remain in the chat stylesheet. Tests cover receipt precedence and origin-link navigation/availability.

## Verification

Add focused UI/logic tests before implementation, run the relevant frontend test files, then run the frontend build.
