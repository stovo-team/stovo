---
title: "Testing and Verification"
type: workflow
---

# Testing and Verification

- Test externally observable contracts where practical; avoid tests that only mirror private implementation details.
- Use unit or component tests for local rules and UI states, integration tests for persistence and HTTP or transaction boundaries, and end-to-end tests for critical user journeys.
- Use property-based or fuzz tests for broad input spaces and parser/protocol robustness when they cover a real risk; keep named examples for important user behavior.
- Prefer deterministic tests with injected clocks, randomness, and external-service boundaries.
- Keep integration and end-to-end tests isolated from production data and credentials.
- Never weaken or delete tests to get a passing suite. If expected behavior must change, revisit the contract with the requester.
- Follow CONTRIBUTING.md for commands and environment setup. Run checks required by the applicable workflow and checks the user requests; avoid unrelated suites.
- Report the checks run and their results. State clearly when a required check could not be run.

Map stable acceptance IDs to scenarios, proof layers and expected results using the [test-plan template](templates/test-plan.md). Record blocked/skipped checks honestly and bind results to source contents. Human decision scopes follow [approvals](approvals.md).

For backend or deployment behavior, use [backend impact evidence](backend-evidence.md) to compare actual before/after results, bind execution receipts and review their limitations.
