---
name: stovo-delivery-review
description: Use when preparing a Stovo delivery or PR description; check requirements, test results, QA and visual evidence before readiness. Does not authorize publishing.
---

# Stovo delivery review

Find the current checkout root with `git rev-parse --show-toplevel`. Read `docs/agent-workflows/isolation-and-delivery.md` from that root, then its applicable references. Resolve all references from the repository root, including copy installations.

Read `docs/agent-workflows/approvals.md` for review and action scopes. Use the canonical Stovo workflow once; reuse a generic installed skill for its specialized work without starting a duplicate overall process. Applicable human and higher-priority host instructions prevail.

Output: Self-contained English PR body, required check results, evidence and outstanding blockers. Verify actual human authorization before remote writes.

Complete only when actual command results or observed artifacts support each claim. Record missing prerequisites as blocked and preserve unrelated work.

Run `scripts/agent-workflows/validate-delivery.mjs` with the actual contract/evidence/QA and changed-path files. Render the PR packet with `render-pr.mjs`; these commands never authorize or perform publication.
