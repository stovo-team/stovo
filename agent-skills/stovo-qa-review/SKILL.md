---
name: stovo-qa-review
description: Use for independent acceptance review of a coherent Stovo delivery against approved requirements, including visual regressions or missing edge cases. Do not implement product changes.
---

# Stovo qa review

Find the current checkout root with `git rev-parse --show-toplevel`. Read `docs/agent-workflows/independent-qa.md` from that root, then its applicable references. Resolve all references from the repository root, including copy installations.

Read `docs/agent-workflows/approvals.md` for review and action scopes. Use the canonical Stovo workflow once; reuse a generic installed skill for its specialized work without starting a duplicate overall process. Applicable human and higher-priority host instructions prevail.

Output: Reproducible findings, acceptance coverage and limitations. Preserve expected assertions and application sources. Use a fresh context for independent review.

Complete only when actual command results or observed artifacts support each claim. Record missing prerequisites as blocked and preserve unrelated work.
