---
title: "New Chat Close Button Implementation Plan"
type: implementation-plan
---

# New Chat Close Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the New Chat dialog close button match the circular gray close control already used by Add People.

**Architecture:** Promote the existing Add People close-button surface and border to the shared `.new-chat-screen-close` rule. Keep the current close action, accessible label, dimensions, and interaction behavior.

**Tech Stack:** CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-10-mock-screen-share-layout-design.md` (New Chat close button section).

## File Map

| File | Responsibility |
| --- | --- |
| `frontend/src/styles.css` | Provide the shared close-button surface, border, and hover style. |
| `frontend/src/features/chats/details/AddPeopleDialog.styles.test.ts` | Verify shared dialog close-button styling and preserve Add People styling. |
| `frontend/src/pages/ChatsPage.new-chat-modal.test.ts` | Verify New Chat keeps its accessible close button and callback. |
| `frontend/src/features/chats/sidebar/NewChatDialog.tsx` | Existing close control and callback, read-only reference. |

## Global Constraints

- The New Chat dialog close control is circular and has the same gray background, border, and interactive states as the Add People dialog close control.
- Its close action and accessible name remain unchanged.
- Keep changes focused and preserve unrelated work.

## Review Focus

- The shared base selector applies to New Chat as well as Add People; the CSS regression test checks `.new-chat-screen-close` directly.
- Theme tokens keep the gray surface and border visible across themes; the regression test checks the surface and border tokens.
- Hover styling stays consistent after promoting it from the Add People override; the regression test checks the shared hover rule.

---

### Task 1: Promote the dialog close style to the shared rule

**Files:**
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/features/chats/details/AddPeopleDialog.styles.test.ts`
- Modify: `frontend/src/pages/ChatsPage.new-chat-modal.test.ts`
- Reference: `frontend/src/features/chats/sidebar/NewChatDialog.tsx`

**Interfaces:**
- Consumes: `.new-chat-screen-close`, already used by New Chat and Add People.
- Produces: the shared base rule sets `background: var(--surface-card)`, `border: 1px solid var(--border-default)`, and `border-radius: 50%`; hover uses `var(--background-tertiary)`.

- [ ] **Step 1: Change the close-style regression test first.** In `AddPeopleDialog.styles.test.ts`, rename the describe block to “Shared dialog close button appearance” and assert the background, border, circular radius, and hover color on the shared `.new-chat-screen-close` selector rather than only on the Add People scoped override. In `ChatsPage.new-chat-modal.test.ts`, retain the `aria-label="Close new message"` and button-class assertions and add an assertion that the button still calls `onClose`.
- [ ] **Step 2: Run the focused style and modal tests and confirm the shared-style assertion fails against the current transparent base rule.**

Run from `frontend`:

```bash
npx vitest run src/features/chats/details/AddPeopleDialog.styles.test.ts src/pages/ChatsPage.new-chat-modal.test.ts
```

Expected: FAIL because the shared base selector currently has a transparent background and no border.

- [ ] **Step 3: Promote the existing gray surface, border, and hover style** from the `.add-people-dialog .new-chat-screen-close` rules to `.new-chat-screen-close` in `frontend/src/styles.css`; remove the now-redundant Add People scoped close rules. Preserve the existing 40px circular hit area, active state, `NewChatDialog.tsx` action, and accessible label.
- [ ] **Step 4: Run the focused tests unchanged and confirm both dialogs use the shared style.**

Run from `frontend`:

```bash
npx vitest run src/features/chats/details/AddPeopleDialog.styles.test.ts src/pages/ChatsPage.new-chat-modal.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run frontend lint and build.**

Run from `frontend`: `npm run lint` and `npm run build`.

Expected: both pass.

- [ ] **Step 6: Commit the close-button style.**

```bash
git add frontend/src/styles.css frontend/src/features/chats/details/AddPeopleDialog.styles.test.ts
git commit -m "[Fix] match new chat close button to dialogs"
```
