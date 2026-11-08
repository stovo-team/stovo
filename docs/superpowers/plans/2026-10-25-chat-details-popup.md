---
title: "Chat Details Popup Implementation Plan"
type: engineering-plan
---

# Chat Details Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the existing compact chat details popup at every screen size and remove the separate desktop details column.

**Architecture:** Keep `ChatDetailsPanel` and its dialog behavior unchanged. Promote its existing small-screen fixed popup, backdrop, and compact sizing styles to global rules, and remove the grid rules that allocate a separate details column when details are open.

**Tech Stack:** React, TypeScript, CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-chat-details-popup-design.md`

## Global Constraints

- Keep changes focused and preserve unrelated work.
- Keep the primary checkout clean and complete the change in the dedicated `feature/chat-details-popup` worktree.
- Do not push, publish, merge, or open a pull request.
- Preserve the existing detail controls, dialog semantics, close behavior, and call-specific visibility.

## Review Focus

- Wide desktop viewports above 1200px must show the popup capped at 400px; assert the popup positioning rule is global.
- Medium viewports must keep the chat grid at two columns; assert the third-column and tablet grid overrides are absent.
- Narrow viewports must keep at least 32px of horizontal viewport margin; assert `width: min(400px, calc(100vw - 32px))` remains.
- Long details content must remain scrollable; assert `.chat-info-body` retains `overflow: auto`.
- Expanded voice calls must retain their current details visibility rule; assert `.voice-call-expanded .chat-details-panel` remains hidden.

---

### Task 1: Use the compact popup at every screen size

**Files:**
- Modify: `frontend/src/features/chats/details/ChatDetailsPanel.responsive.test.ts`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: existing `ChatDetailsPanel` dialog root (`.chat-info-screen.chat-details-panel`), existing compact rules under `@media (max-width: 1200px)`, and existing `.chat-layout.details-open` grid rule.
- Produces: one fixed popup positioned 12px from the top, right, and bottom, with `width: min(400px, calc(100vw - 32px))`, at all viewport widths; chat layout remains two columns.

- [ ] **Step 1: Update the responsive test first**

In `ChatDetailsPanel.responsive.test.ts`, rename the suite and replace assertions that expect responsive popup-only rules and a desktop grid column. Assert globally that the popup uses fixed 12px offsets, capped width, panel radius and shadow; the backdrop is present; the compact 72px avatar and action sizing remain; the third-column and tablet grid overrides are absent; the details body remains scrollable; and the expanded-call visibility rule remains.

- [ ] **Step 2: Run the focused test and confirm the expected failures**

Run from `frontend`: `npx vitest run src/features/chats/details/ChatDetailsPanel.responsive.test.ts`

Expected: FAIL because details still allocate a desktop grid column and popup positioning and backdrop are restricted to small-screen rules.

- [ ] **Step 3: Promote the existing popup styles to all sizes**

In `frontend/src/styles.css`, remove the desktop `.chat-layout.details-open` third-column rule and the `769px–1200px` grid override. Move popup positioning and compact sizing declarations from `@media (max-width: 1200px)` into global chat-details rules, and promote the existing `.chat-layout.details-open::before` backdrop rule out of the mobile layout query. Set `.chat-layout` as the backdrop's positioning context. Keep the existing animation, 12px offsets, 400px cap, compact controls, and z-index unchanged. Keep mobile navigation and call-specific rules in their current media/feature scopes.

- [ ] **Step 4: Run focused chat details tests**

Run from `frontend`: `npx vitest run src/features/chats/details/ChatDetailsPanel.responsive.test.ts src/pages/ChatsPage.chat-details.test.ts src/features/chats/details/ChatDetailsPanel.shared-content.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run required frontend verification**

Run from `frontend`: `npm test -- --reporter=dot`, `npm run lint`, and `npm run build`.

Expected: all three commands pass.

- [ ] **Step 6: Commit the completed task**

```bash
git add docs/superpowers/specs/2026-10-25-chat-details-popup-design.md docs/superpowers/plans/2026-10-25-chat-details-popup.md frontend/src/features/chats/details/ChatDetailsPanel.responsive.test.ts frontend/src/styles.css
git commit -m "Feature: use chat details popup on desktop"
```
