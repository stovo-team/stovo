---
name: stovo-workflow-evals
description: Use when evaluating or changing Stovo skills, routing or approval workflows; compare fixed cases against a recorded baseline. Ordinary product testing uses the testing workflow.
---

# Stovo workflow evals

Find the current checkout root with `git rev-parse --show-toplevel`. Read `docs/agent-workflows/workflow-evals.md` from that root. Resolve all references from the repository root, including copy installations.

Read `docs/agent-workflows/approvals.md` for review and action scopes. Use the canonical Stovo workflow once; reuse a generic installed skill for its specialized work without starting a duplicate overall process. Applicable human and higher-priority host instructions prevail.

Output: Measured baseline/candidate report with fixed cases and hard failures. Until a real adapter run exists, label fixture tests as fixtures, not model evaluations.

Complete only when actual command results or observed artifacts support each claim. Record missing prerequisites as blocked and preserve unrelated work.
