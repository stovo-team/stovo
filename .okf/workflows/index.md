# Workflows

<!-- okf:generated:start -->
## Generated facts
- PR rules: stack isolation, size budget
<!-- okf:generated:end -->

## Curated engineering workflow rules

1. **PR Stacking & Size Budget**:
   - Target <= 300 LOC per PR.
   - Strict hard cap <= 400 LOC (maximum limit <= 445 LOC).
   - Sequential stack branching (`origin/master` -> `PR 1` -> `PR 2` -> `PR 3`).
2. **Anti-Weakening Invariant**:
   - Never weaken or delete test assertions (`assert`, `expect`, `t.Fatal`, `t.Error`) to make changes pass.
   - Verified automatically by `scripts/check-test-integrity.mjs`.
3. **TDD Contract**:
   - Write observable failing tests first (Red), then implement minimal passing logic (Green).
