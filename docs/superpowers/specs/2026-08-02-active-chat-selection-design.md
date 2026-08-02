# Active chat selection styling

## Goal

Make the selected chat in the chat list easier to identify without using a
separate left-hand indicator.

## Scope

Update only the `.chat-list-item.active` rule in `frontend/src/styles.css`.

- Remove its left border and restore the standard 12px corner radius.
- Strengthen the existing accent-tinted background so the selected row is
  visibly brighter while preserving the theme's accent color.
- Leave layout, hover styling, text, and all non-active chat rows unchanged.

## Verification

The active chat row has no vertical stripe at its left edge and presents a
clearly brighter accent-tinted background than an inactive row. The project
frontend checks continue to pass.
