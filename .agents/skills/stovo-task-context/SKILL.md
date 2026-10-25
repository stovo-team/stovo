---
name: stovo-task-context
description: Use when locating Stovo code and tests for a bug or feature, or resuming work from another agent or a compacted chat.
---

# Stovo task context

Find the active checkout with `git rev-parse --show-toplevel`; resolve these paths from that root.

Read `docs/architecture/subsystems.md#task-navigation` and follow the relevant boundary from the reported interaction to its callers, implementation and neighboring tests. Read only the matching area and expand when a call, contract or failure crosses it.

Use `docs/agent-workflows/bug-fixes.md` for defects and `docs/agent-workflows/feature-development.md` for new behavior. Existing task authorization and higher-priority host instructions apply.

Before editing, identify the observed or requested behavior, exact symbols and files, affected callers, reuse candidates, and focused proof command. If one remains unknown, record it and inspect that boundary next.

For resumption or an authorized handoff, read `docs/agent-workflows/task-handoff.md`. Finish context discovery when the next code or test change and its proof are concrete; a directory list alone is insufficient.
