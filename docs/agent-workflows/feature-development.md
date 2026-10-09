# Feature Development

Use this workflow for new features and materially new user-visible capabilities.

1. Write a feature plan stating the user problem, scope, observable behavior, constraints, and important design decisions.
2. Write a test plan covering user scenarios, edge cases, security properties, and the test layer that will prove each behavior.
3. Implement the planned tests before the feature behavior. Run them and confirm they fail for the expected missing behavior.
4. Implement the smallest coherent change that makes the tests pass.
5. Refactor while keeping tests green, run the relevant broader checks, and review the test plan for omissions.

Keep the feature and test plans reviewable before implementation. Prefer tests of externally observable behavior. Use unit or component tests for local rules and UI states, integration tests for persistence and HTTP or transaction boundaries, and end-to-end tests for critical user journeys. Use property-based or fuzz tests when they address a broad input space or parser/protocol risk. Follow the shared [testing expectations](testing.md).
