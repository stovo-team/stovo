---
title: "Task context and handoff"
type: workflow
---

# Task context and handoff

Use this record when resuming after compaction or transferring authorized work. Put it in the task chat or ignored task artifacts; link canonical documents and exact source symbols instead of copying large files. A handoff preserves existing scope and permissions.

## Context record

- **Task:** reported/requested behavior, acceptance IDs when present, current blocker and next concrete action.
- **Checkout:** repository, worktree, branch, base/HEAD, dirty paths and unrelated work to preserve.
- **Authority:** actual human approval source and its implementation/publication/merge scopes; approved artifact paths and versions when applicable.
- **Trace:** interaction → entry symbol → implementation → affected callers; exact file paths and useful line references, with uncertainty labelled.
- **Reuse:** existing helper/component/port/dependency considered and the reason for the chosen boundary.
- **Proof:** focused command, prerequisites, observed failing/passing/blocked result and source revision; frontend evidence paths and state when applicable.
- **Next:** smallest code/test change still needed, unresolved question, and completion criterion.

The receiving agent confirms the checkout and current diff, opens the cited implementation and test, and reruns source-sensitive checks when relevant contents changed. Continue the applicable [bug](bug-fixes.md) or [feature](feature-development.md) workflow from that evidence.

## Specialized guidance

Root `AGENTS.md` already adapts Ponytail: trace callers before editing, check reuse and installed capabilities, choose the smallest complete change, include every affected boundary, and preserve security/accessibility/data protections. Apply that checklist to the trace and reuse fields above.

Use available Matt Pocock skills for their specific question within the Stovo workflow:

| Question | Skill |
| --- | --- |
| Why does the behavior fail or slow down? | `diagnosing-bugs` |
| Where should an interface or seam sit? | `codebase-design` |
| Which domain term or invariant applies? | `domain-modeling` |
| How should a context pointer or skill be written? | `writing-for-agents` |
| Does a branch meet repository standards and spec? | `code-review` |

Check the current host skill catalog for availability and its `SKILL.md` path; installations are host-specific. Read the selected skill before using it. A smaller model can use the same context record; correctness is established by observed checks and review. Changing models or dispatching another agent requires the host's supported controls and applicable authorization.
