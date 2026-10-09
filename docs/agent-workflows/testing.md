# Testing and Verification

- Test externally observable contracts where practical; avoid tests that only mirror private implementation details.
- Use unit or component tests for local rules and UI states, integration tests for persistence and HTTP or transaction boundaries, and end-to-end tests for critical user journeys.
- Use property-based or fuzz tests for broad input spaces and parser/protocol robustness when they cover a real risk; keep named examples for important user behavior.
- Prefer deterministic tests with injected clocks, randomness, and external-service boundaries.
- Keep integration and end-to-end tests isolated from production data and credentials.
- Never weaken or delete tests to get a passing suite. If expected behavior must change, revisit the contract with the requester.
- Follow CONTRIBUTING.md for commands and environment setup. Run checks required by the applicable workflow and checks the user requests; avoid unrelated suites.
- Report the checks run and their results. State clearly when a required check could not be run.
