---
title: "Feature Development"
type: workflow
---

# Feature Development

Use this workflow for new features and materially new user-visible capabilities.

1. Follow [contract sizing and approval](approvals.md). Write a feature plan stating the user problem, scope, observable behavior, constraints, and important design decisions.
2. Write a test plan covering user scenarios, edge cases, security properties, and the test layer that will prove each behavior.
3. Prepare the actual spec and test plan for one combined human review. Record or reuse the applicable approval before changing feature behavior; preserve stable acceptance IDs and the reviewed contents.
4. Implement the planned tests before the feature behavior. Run them and confirm they fail for the expected missing behavior.
5. Implement the smallest coherent change that makes the tests pass.
6. Refactor while keeping tests green, run the relevant broader checks, and review the test plan for omissions.

Keep the feature and test plans reviewable before implementation. Prefer tests of externally observable behavior. Use unit or component tests for local rules and UI states, integration tests for persistence and HTTP or transaction boundaries, and end-to-end tests for critical user journeys. Use property-based or fuzz tests when they address a broad input space or parser/protocol risk. Follow the shared [testing expectations](testing.md).

Use [dependency and reusable-code assessment](dependency-and-reuse.md) when substantial capability or extraction is involved.
