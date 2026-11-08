---
title: "Page Width Priority Implementation Plan"
type: engineering-plan
---

# Page Width Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Expand the Plans calendar across its available desktop pane and prioritize a 1400px conversation while the chat list absorbs excess width.

**Architecture:** Update the existing wide-screen layout rule in the final shared stylesheet. Give the standard desktop chat grid a flexible list track and a conversation track capped at 1400px; let Plans content stretch to its pane edges. Keep the 1600px breakpoint and narrower rules.

**Tech Stack:** CSS, Playwright E2E with local mock fixtures, Vitest CSS-source tests.

**Spec:** `docs/agent-workflows/specs/page-width-priority.md`

## Global Constraints

- Preserve current responsive behavior below 1600px.
- Preserve the chat list minimum width and voice-call expanded layout.
- Keep the three-day and week calendar minimum widths at 620px and 1200px.

## Review Focus

- At widths just above 1600px, the chat track must shrink enough to preserve the current minimum chat-list width.
- At widths above the combined chat cap and minimum list width, no blank space should remain between the list, conversation, and layout edge.
- The 2200px layout must not constrain the Plans content to 1200px.
- Mobile chat and narrow week-calendar scrolling must keep their current behavior.
- Voice-call expanded mode must retain its one-column grid.

---

### Task 1: Wide-screen page width priority

**Files:**
- Create: `e2e/tests/page-width-priority.spec.ts`
- Create: `frontend/src/pages/ChatsPage.width-layout.test.ts`
- Modify: `frontend/src/styles/guest-meetings-and-final-overrides.css`
- Modify: `frontend/src/pages/PlansPage.test.ts`
- Evidence: `docs/evidence/page-width-priority-*.png`

- [ ] Write browser assertions for P1, C1, C2, and R1 and capture baseline screenshots.
- [ ] Run the focused browser test and confirm P1 and C2 fail because of the current 1200px cap and fixed-width chat list.
- [ ] Add CSS regression assertions, run them to confirm the current wide-screen cap and grid fail the new expectations.
- [ ] Update only the existing ≥1600px shared rule to remove the Plans cap, cap the active chat at 1400px, and allocate remaining width to the chat list.
- [ ] Run the browser and focused CSS checks; capture after screenshots and record browser, OS, viewport, theme, locale, interaction, and SHA-256 metadata.
- [ ] Run the dedicated visual test and evidence capture workflows; inspect output.
- [ ] Commit the complete change as one focused task.
