---
title: "Workflow decision evaluations"
type: workflow
---

# Workflow decision evaluations

Use fixed cases under `agent-evals/cases` and separate held-out cases under `agent-evals/held-out`. Freeze inputs, `expectations.json`, guidance and grader before trials. The importer hashes expectations, scorer and grading runner; changing any requires a newly versioned comparison. Give the model case inputs and relevant guidance; keep grading expectations outside its context. Capture actual native Desktop agent outputs and tool receipts. Imported fixture answers verify the harness only.

Use a fresh native Desktop agent per guidance/trial where possible. Preserve runtime and model settings across baseline/candidate; disclose shared context, unavailable model identifiers, costs, token counts and latency. Do not change global CLI settings to work around a separate CLI login/model failure. CLI and Desktop runtime availability are independent.

Each answer explains its decision with evidence from the supplied guidance and case facts. Check every fixed mandatory expectation separately. A candidate with any hard failure remains failing even when total errors improve. Compare identical case IDs, input/grader digests and runtime/model metadata. Differences require a new comparison, not an invented improvement score. Inspect failures before changing instructions; preserve the old dataset and report whenever revising ambiguous cases.

## Import a real Desktop trial

Create an ignored run directory with the actual `answers.json` and a parent-recorded `receipt.json`: `runtime: desktop-native`, actual `agentId`, trusted chat/tool `source`, `model` (or explicitly unavailable) and SHA-256 `answersDigest`, `guidanceDigest` for captured `guidance.md`, plus `caseDigests` keyed by case ID. Receipts document provenance; files do not authenticate themselves. An adapter is trusted executable local code: review it before use.

```sh
node scripts/agent-workflows/run-evals.mjs --cases agent-evals/cases --adapter scripts/agent-workflows/desktop-adapter.mjs --input artifacts/agent-workflows/evals/baseline-1 --output artifacts/agent-workflows/evals/baseline-1/results
node scripts/agent-workflows/score-evals.mjs --baseline artifacts/agent-workflows/evals/baseline-1/results --candidate artifacts/agent-workflows/evals/candidate-1/results --report artifacts/agent-workflows/evals/comparison-1.json
```

Repeat with `--cases agent-evals/held-out` and separate outputs. The importer performs no model call; actual dispatch is a host operation with its own trace. `durationMs` measures import/grading only. Missing outputs/receipts fail; no simulated fallback. Store raw traces locally, redact sensitive data and publish only authorized artifacts.

These cases evaluate workflow decisions: review scope, visual evidence, test-first work, dependencies and publication permission. They are not an end-to-end coding benchmark or proof of automatic skill discovery. Verify installed skills in a fresh host chat whose catalog includes them; link/copy validation alone does not show host catalog refresh. Product correctness uses [testing](testing.md), [frontend evidence](frontend-evidence.md) and [independent QA](independent-qa.md).
