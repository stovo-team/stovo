---
name: stovo-bug-fix
description: Use when fixing a Stovo bug, defect, production incident or regression.
---

# Stovo bug fix

Find the active checkout with `git rev-parse --show-toplevel`; resolve these paths from that root.

Read `docs/agent-workflows/bug-fixes.md` and apply its regression-first sequence. Locate the affected code and tests through `docs/architecture/subsystems.md#task-navigation`; use `docs/agent-workflows/task-handoff.md` when resuming work.

For frontend defects also read `docs/agent-workflows/frontend-evidence.md`. Use installed debugging skills for difficult diagnosis within this workflow. Existing task authorization and higher-priority host instructions apply.

Output: reproduced failure, an unchanged regression test passing after the fix, relevant broader results, and required evidence or explicit blockers.
