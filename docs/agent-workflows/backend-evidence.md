---
title: "Backend impact evidence"
type: workflow
---

# Backend impact evidence

For backend or deployment behavior changes, describe the observable acceptance result before editing: an API result, stored state, trace event, error rate or measured latency. A green test suite and an author's claimed improvement alone do not demonstrate that result. Follow [bug fixes](bug-fixes.md) for regression RED→GREEN and [independent QA](independent-qa.md) for a fresh reviewer.

Replay the same sanitized input against the trusted base and changed source in disposable local services or isolated stage. Hold fixtures, configuration, runtime, target and command constant; record reset steps. For measurements, specify units, sample count, warmup, load, errors and comparison threshold in the acceptance criterion. Use identical harness code on both revisions when the base lacks the new regression test; disclose the harness patch.

## Capture actual execution

Write a scenario command that consumes the request/fixture on stdin, asserts the expected result and prints sanitized API/persistence/trace output or measurement data. A successful process exit must mean its assertions passed. Use repository-relative arguments so both revisions execute the same command. Keep credentials out of arguments and captured output.

Run this from each isolated revision with the same input bytes and environment:

```sh
node scripts/agent-workflows/capture-backend.mjs --input artifacts/backend/request.json --output artifacts/backend/after.json --environment local --target disposable-api --runtime 'Go 1.25; PostgreSQL 16; reset fixture v1' --kind api --command '["node","scripts/reproduce-retry.mjs"]'
```

The command is illustrative; use the actual scenario script and installed runtime. Use `before.json` at the base and `after.json` at the changed revision. Capture output must be Git-ignored and new. The recorder runs argv without a shell, feeds the input bytes, preserves stdout/stderr and the actual exit code, hashes the receipt, and rejects source/input mutation during execution. A nonzero before result is retained and the CLI exits unsuccessfully; it must never be relabeled passed. Capture does not decide whether arbitrary output satisfies acceptance.

## Delivery fields

Add `backendImpact` to the existing evidence manifest. Each entry contains:

- `id`, `checkId`, `acceptanceId`, and `expected` matching the approved acceptance text.
- `input: {path, sha256}` for the replayed bytes.
- `before` and `after`: the recorder's `observation` values, retaining their receipt artifacts.

The named check uses the scenario's actual argv and acceptance ID. The after execution must exit zero. The before revision is the trusted delivery base; after is the current source and dirty patch digest. Both observations must name the same input digest, environment, target, runtime, kind and command. Receipts bind command, timestamps, source, input, exit status and observed output; all referenced files are hash checked. Set acceptance `backend: true` for every backend criterion so the validator requires its observation; `backendImpactRequired: true` also requires proof when path classification alone cannot identify backend impact.

Independent QA records `backendImpactIds` for the observations inspected and `evidenceDigest` equal to SHA-256 of `JSON.stringify(evidence)`, in addition to the existing source/patch/contract fields. Review the actual receipts, expected assertions, reset conditions and limitations. Then run the existing [delivery validator](isolation-and-delivery.md) against actual Git paths; renames retain both source and destination for applicability.

## Scope of proof

Local receipts and hashes prove consistency and recorded execution, not identity or honesty. Review the scenario code and trusted tool/run source; hand-authored receipts can be forged. Stage proof must include the service's deployed revision and actual response/persistence evidence, checked by QA against the intended source. If services, before data or mandatory checks are unavailable, record a blocker; do not substitute fixtures or fabricated scores.

Local or stage acceptance does not certify production rollout. Production confirmation requires a separately authorized deployment, deployed revision, observation window, actual health/error/result evidence and rollback outcome when applicable. The **Agent workflow gate** covers its validator tests and synthetic UI jobs only; it does not certify independent code review, backend acceptance, other required PR checks or production health. Repository rules and inspection of real PR checks remain necessary.
