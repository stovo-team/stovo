# Stovo project skills

Canonical entry points are regular tracked files in [`.agents/skills`](../.agents/skills/), the repository skill discovery directory. Fresh checkouts include them without running an installer. Start a fresh Codex chat and inspect its skill catalog to confirm host discovery; filesystem checks do not prove catalog refresh.

| Task | Entry point |
| --- | --- |
| Locate feature code/tests or resume work | `stovo-task-context` |
| Fix a defect | `stovo-bug-fix` |
| Plan new behavior | `stovo-feature-contract` |
| Capture frontend evidence | `stovo-frontend-evidence` |
| Review acceptance independently | `stovo-qa-review` |
| Prepare delivery | `stovo-delivery-review` |
| Evaluate workflow decisions | `stovo-workflow-evals` |

The wrappers reach canonical [agent workflows](../docs/agent-workflows/approvals.md). Read one applicable workflow, then use installed Matt Pocock or Superpowers skills for specialized work within it. Ponytail principles are already adapted in root `AGENTS.md`.

`node scripts/agent-workflows/install-skills.mjs` checks the checkout installation without rewriting it. To install elsewhere, preview the exact target with `--target <directory> --mode copy --dry-run`, then repeat without `--dry-run` under applicable authorization. `--mode link` creates relative links that survive moving the containing checkout. Copy mode supports hosts without symlinks. Existing unrelated skills and conflicting names are preserved; modified owned copies are reported as collisions.

The installer accepts `--source <directory>` for another canonical skill tree. It never edits plugin caches. Personal installation needs its own authorization; tracked repository skills are sufficient for project discovery.
