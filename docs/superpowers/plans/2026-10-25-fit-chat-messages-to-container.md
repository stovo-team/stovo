---
title: "Fit chat messages to the available chat width Implementation Plan"
type: engineering-plan
---

# Fit chat messages to the available chat width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep message bubbles and attachments inside the conversation's available width and make them more compact in narrow chat areas without shrinking text.

**Architecture:** Use CSS sizing relative to the message list's containing width so a narrow chat pane constrains its bubbles and media regardless of viewport width. Keep current desktop caps for wide panes and cover the narrow layout with style regression tests.

**Tech Stack:** CSS, Vitest, jsdom.

**Spec:** `docs/superpowers/specs/2026-10-25-fit-chat-messages-to-container-design.md`

## Global Constraints

- Keep message text at its current size.
- Preserve existing roomy desktop sizing.
- Constrain bubbles, photos, albums, videos, and document previews to the available chat width.
- Use CSS only for the layout behavior.

## Review Focus

- A document preview must not grow to viewport width when its chat pane is narrower; assert the width rule uses its containing block.
- Mobile and narrow embedded chat panes must constrain media without shrinking message text; assert compact container-based caps and unchanged font sizing.
- Photos and albums must remain bounded by their bubble; assert existing child sizing remains `max-width: 100%` or `width: 100%`.
- Portrait videos must retain a narrower cap than landscape videos; assert the portrait width rule remains more restrictive.
- Wide layouts must retain their existing size caps; assert the desktop rules remain in place.

---

## File Map

- `frontend/src/styles.css`: message bubble, photo, video, album, and document width constraints.
- `frontend/src/styles.emoji-picker.test.ts`: narrow chat sizing regression assertions alongside existing message media sizing tests.
- `frontend/src/components/VideoPlayer.test.tsx`: update the document preview sizing assertion if its old viewport-based expectation changes.

### Task 1: Pin narrow chat sizing behavior in CSS tests

**Files:**
- Modify: `frontend/src/styles.emoji-picker.test.ts`
- Modify: `frontend/src/components/VideoPlayer.test.tsx`
- Modify: `frontend/src/components/DocumentAttachmentPreview.test.tsx`

**Interfaces:**
- Consumes: current `.message-bubble` and media sizing rules in `frontend/src/styles.css`.
- Produces: regression assertions for container-relative narrow widths, preserved text size, and document preview sizing.

- [x] **Step 1: Add assertions for constrained bubble and media sizing**

  Assert that narrow chat bubble/media caps use containing-block percentages, document previews no longer use `100vw` for width, text sizing is not overridden by narrow rules, and portrait-only videos remain narrower than landscape videos.

- [x] **Step 2: Run the focused style tests and confirm the new assertions fail**

  Run: `cd frontend && npx vitest run src/styles.emoji-picker.test.ts src/components/VideoPlayer.test.tsx src/components/DocumentAttachmentPreview.test.tsx`
  Expected: FAIL on the current viewport-based document preview sizing and missing narrow container caps.

### Task 2: Constrain message and media widths to the chat area

**Files:**
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: existing breakpoint rules for `.message-bubble`, `.message-video-attachment`, `.message-media-album`, and `.document-preview-card`.
- Produces: compact width caps based on the conversation's containing width while retaining the existing text size and wide-layout caps.

- [x] **Step 1: Set the document preview bubble width relative to its containing block**

  Replace the viewport-relative width with a containing-block-based maximum capped at the existing 560px desktop size.

- [x] **Step 2: Add narrow chat width caps for bubbles and media**

  In the existing narrow layout rules, reduce generic bubble and media maximum percentages so the bubble, image/album, video, and document preview remain inside the available message-list width. Keep portrait videos narrower than landscape videos. Do not change `font-size`.

- [x] **Step 3: Run the focused tests and the required frontend checks**

  Run: `cd frontend && npx vitest run src/styles.emoji-picker.test.ts src/components/VideoPlayer.test.tsx src/components/DocumentAttachmentPreview.test.tsx`
  Expected: PASS.

  Run: `cd frontend && npm test && npm run lint && npm run build`
  Expected: all commands PASS.

## Self-review

- Spec coverage: bubble and media constraints are covered by Task 2; text size preservation and wide layout behavior are pinned by Task 1.
- Step scan: each checkbox adds a test, verifies its failure, changes a concrete CSS rule, or runs a named command.
- Type consistency: no TypeScript interfaces or runtime APIs change.
- Review focus: all five likely failure cases have explicit assertions in Task 1.
- Proportion: two focused tasks cover one CSS feature and its regression checks.
