# Contributing to Stovo

Thanks for helping improve Stovo. Bug reports, focused fixes, documentation improvements, and carefully scoped feature proposals are welcome.

## Before opening an issue

- Search existing issues for the same problem or proposal.
- For a suspected security vulnerability, do not open a public issue. Use [GitHub's private vulnerability reporting](https://github.com/stovo-team/stovo-messenger/security/advisories/new) as described in [SECURITY.md](SECURITY.md).
- Do not include passwords, access tokens, encryption keys, private messages, personal data, or production logs containing such data in issues or pull requests.

Use the issue forms for [bug reports](https://github.com/stovo-team/stovo-messenger/issues/new?template=bug_report.yml), [design issues](https://github.com/stovo-team/stovo-messenger/issues/new?template=design_issue.yml), and [feature requests](https://github.com/stovo-team/stovo-messenger/issues/new?template=feature_request.yml). Include only the information needed to reproduce or understand the request, and redact sensitive values. Design issues require a screenshot and a suggested fix; bug report reproduction steps are optional.

## Propose a change

For a substantial change, open an issue first to discuss the user need and scope. Keep pull requests focused, explain the observable behavior they change, and link the related issue where applicable. Avoid mixing unrelated cleanup into a feature or fix.

Pull requests should stay near or below 400 changed lines; CI enforces a hard cap of 445 additions + deletions across all files. If a change requires a large number of lines of code or spans multiple architectural layers (e.g., database migrations/schemas, backend services, frontend UI, E2E tests), partition it into a logical stack of pull requests. Each PR in the stack targets its predecessor branch and stays within the line limit. Use GitHub's native stacked PR feature ("Preview stack" / "Create stack") and cross-link PRs in the description.

Before submitting a pull request:

1. Create a branch from the current `master` branch (or predecessor branch for stacked PRs).
2. Make the smallest coherent change and add or update automated tests for changed behavior.
3. Run the checks relevant to the files you changed.
4. Update user or operator documentation when behavior, configuration, or deployment steps change.
5. Describe the change, verification commands and results, and any known limitations in the pull request.

## Development checks

Run commands from the indicated directory. The Go test suite may use integration tests when TEST_DATABASE_URL and TEST_REDIS_URL are set; without them, those integration tests skip.

### Backend

```sh
cd backend
go test ./...
make lint
```

The CI integration run provisions PostgreSQL and Redis and uses these environment variables:

```sh
TEST_DATABASE_URL='postgres://family_user:family_password@localhost:5432/family_messenger_test?sslmode=disable' \
TEST_REDIS_URL='redis://localhost:6379/0' \
go test -count=1 ./...
```

Use disposable local test services and test credentials; do not point tests at production data.

### Frontend

```sh
cd frontend
npm ci
npm test
npm run lint
npm run build
```

### End-to-end tests

The E2E suite targets a running Stovo environment. Set E2E_BASE_URL to that environment before running it; the Playwright configuration also accepts BASE_URL.

```sh
cd e2e
npm ci
npx playwright install chromium
E2E_BASE_URL=http://localhost:8080 npm run test:ci
```

Use an isolated test deployment and test accounts. E2E tests may create or change data in the configured environment.

### Deployment configuration

When changing Compose files, validate the relevant configuration before opening a pull request:

```sh
docker compose --project-directory . -f deploy/compose/production-bluegreen.yml --env-file .env.example config --quiet
docker compose --project-directory . -f deploy/compose/production-bluegreen.yml -f deploy/compose/external-overlay.yml --env-file .env.example config --quiet
```

These commands validate configuration without starting services. Do not commit local `.env` files or real credentials.

## Pull request review

Be ready to explain tradeoffs and adjust the change in response to review. Keep commits and follow-up changes focused on the pull request. Do not weaken or remove tests to make a change pass; discuss any necessary change in expected behavior with reviewers first.

There is no requirement to use a particular commit-message format. Changes are reviewed for correctness, security, maintainability, documentation, and test coverage appropriate to their impact.
