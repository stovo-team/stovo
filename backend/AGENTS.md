# Backend task navigation

Root [AGENTS.md](../AGENTS.md) and its workflows apply. Use the [subsystem map](../docs/architecture/subsystems.md#task-navigation) to choose the affected boundary; paths below are relative to `backend/`.

- Startup: `cmd/server/main.go` calls `bootstrap.BuildDependencies` and `app.NewWithDependencies`, then serves `server.Routes()` through `transport/http.NewServer`.
- HTTP: find the endpoint's `Register*Routes` in `internal/transport/http/*_routes.go`, follow its handler/use case into `internal/app` or `internal/features/<feature>`, then trace callers of the changed symbol with `rg`.
- Live events: trace `internal/transport/realtime` and its app callers. Persistence/storage changes also require checking `internal/ports`, repository/adapters and schema/migrations consumers.
- Proof: inspect neighboring `*_test.go` first; [bug fixes](../docs/agent-workflows/bug-fixes.md) require a failing regression before behavior changes. Run the matching package/test from this directory; [CONTRIBUTING.md](../CONTRIBUTING.md#backend) describes integration prerequisites and broader checks.
- Cross-layer changes: follow the frontend API/realtime caller and its response/event contract. Record exact trace, focused commands, observed results and blocked dependencies in the [handoff](../docs/agent-workflows/task-handoff.md).
