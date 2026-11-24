# Operations

<!-- okf:generated:start -->
## Generated facts
- Workflows: pipeline.yml, trusted-pr-tests.yml, codeql.yml, security.yml
<!-- okf:generated:end -->

## Curated operations & quality gates

1. **Go Linter (`golangci-lint` v2.14.0)**:
   - `depguard`: Enforces Clean Architecture boundaries.
   - `gosec`, `bodyclose`, `sqlclosecheck`, `noctx`, `errorlint`, `forbidigo`.
2. **Go AST Boundary Check**: Verified automatically via `backend/internal/arch_test.go`.
3. **Frontend Auditing**:
   - TypeScript `noImplicitAny: true`.
   - Dependency Cruiser layer enforcement.
   - `npm audit --audit-level=high`.
4. **Security & SAST Gates**:
   - Gitleaks secret detection.
   - Semgrep static analysis for raw SQL, subprocesses, and unsafe HTML.
   - CodeQL multi-language analysis (`ubuntu-24.04`, `security-extended`).
