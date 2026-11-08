---
title: "Mobile Layout Improvements Implementation Plan"
type: engineering-plan
---

# Mobile Layout Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new-chat dialog, file tiles, canvas message preview, and guest-meeting message card work and read clearly on phones.

**Architecture:** Keep the existing React components and shared popup primitives. Apply responsive changes in the established CSS layers and extend the existing source-backed style and component tests.

**Tech Stack:** React, TypeScript, CSS, Vitest, headless Playwright evidence runner.

**Spec:** User-approved acceptance criteria A1–A4 in the conversation on 2026-10-26.

## Global Constraints

- Preserve desktop geometry and all existing link and button actions.
- Mobile file tiles are exactly `140px` square at widths up to `767px`.
- Preserve popup primitives and theme tokens; do not add a parallel popup surface.
- Do not change UI copy or add translations.
- Capture actual affected mobile UI states and record viewport, theme, locale, browser, and source revision.

## Review Focus

- Narrow phones: popup and message cards remain within the available viewport; assert mobile width rules and inspect at 320px and 390px.
- Desktop regression: 640px new-chat dialog, 180px file tiles, and existing canvas sizing remain unchanged; assert desktop rules.
- Both message directions and themes: meetup actions remain legible on incoming and outgoing bubbles; capture both with light/dark themes.
- Long content: long meetup title and detail text wrap without displacing actions; retain the existing long-title component coverage and inspect the screenshot.
- Keyboard and access: popup retains its close action and focusable controls; existing component behavior tests remain unchanged.

---

### Task 1: Responsive dialog and file tile sizing

**Files:**
- Modify: `frontend/src/styles/chat-details.css`
- Modify: `frontend/src/styles/secondary-settings.css` and the final mobile storage override in `frontend/src/styles/guest-meetings-and-final-overrides.css` only as needed to ensure the winning cascade rule is 140px
- Test: `frontend/src/pages/ChatsPage.new-chat-modal.test.ts`
- Test: `frontend/src/components/StorageCollections.styles.test.ts`

- [ ] Add a regression assertion that the mobile dialog uses a viewport-bounded width with no 640px minimum while desktop retains 640px.
- [ ] Run `npm test -- --run src/pages/ChatsPage.new-chat-modal.test.ts` and confirm the new mobile assertion fails against the current CSS.
- [ ] Add a mobile-only 140px file tile grid rule, keeping desktop 180px; assert both rules in the storage style test.
- [ ] Run `npm test -- --run src/components/StorageCollections.styles.test.ts` and confirm the mobile sizing assertion fails before the CSS change.
- [ ] Implement the smallest CSS changes that pass both tests without changing shared popup primitives.
- [ ] Run both focused tests and inspect computed layout at 320px, 390px, and desktop width.

### Task 2: Compact canvas message preview on mobile

**Files:**
- Modify: `frontend/src/styles/storage-canvas-and-checklist-previews.css` or its final responsive override, based on the stylesheet cascade
- Test: `frontend/src/features/chats/conversation/MessageBubble.test.tsx` or a focused style-contract test alongside it

- [ ] Add a regression assertion for a compact mobile canvas card/preview while retaining the existing desktop maximum width.
- [ ] Run the focused test and confirm the mobile compact-size assertion fails against the current CSS.
- [ ] Add a mobile rule limiting the canvas card to 320px and the preview height to 180px, preserving the existing 16:9 desktop preview.
- [ ] Run the focused test and confirm mobile and desktop sizing contracts pass.

### Task 3: Clear guest-meeting card hierarchy

**Files:**
- Modify: `frontend/src/styles/composer-and-message-editing.css` or its final responsive override, based on the stylesheet cascade
- Test: `frontend/src/features/chats/conversation/MessageBubble.test.tsx`

- [ ] Add component/style assertions that the card remains rendered with both actions, and that its inner surface no longer adds a second border/background while the join action has a high-contrast primary treatment.
- [ ] Run the focused test and confirm the style-contract assertion fails against the current card.
- [ ] Simplify the nested card surface and set clear primary/secondary action contrast using existing theme tokens; preserve URLs, labels, and handlers.
- [ ] Run the focused test and confirm incoming and outgoing invitation content and actions remain available.

### Task 4: Visual evidence and delivery checks

**Files:**
- Create: ignored screenshot evidence under `artifacts/agent-workflows/mobile-layout/`

- [ ] Run the focused UI tests from Tasks 1–3 and the required frontend checks (`npm run check:i18n`, `npm test -- --run src/design-system/tokens.test.ts`).
- [ ] Capture the four affected states with the headless frontend evidence setup at 320px and 390px, plus one desktop reference; cover light/dark and English/Russian where the runner supports it.
- [ ] Inspect screenshots for overflow, CTA contrast, and the four acceptance criteria; record actual browser, OS, viewport, theme, locale, and source revision.
- [ ] Run the relevant frontend build or project-required check from `CONTRIBUTING.md`; report any unavailable check.
