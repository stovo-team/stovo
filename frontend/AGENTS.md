# Frontend task navigation

Root [AGENTS.md](../AGENTS.md) and its workflows apply. Use the [subsystem map](../docs/architecture/subsystems.md#task-navigation) to choose the affected boundary; paths below are relative to `frontend/`.

- Startup/routes: `src/main.tsx` runs `startApp`, then `src/App.tsx` wires providers and `ClusterRoutes`. Follow the affected page into `src/features` and trace the changed symbol's callers with `rg`.
- HTTP/live behavior: trace the feature's `src/api` function through `apiRequest` in `src/api/client.ts`, or the relevant `src/realtime` event/call controller, then inspect the backend handler and contract.
- Reuse/copy/styles: search shared `src/components`, `src/design-system/tokens.css`, and both `src/config/strings` catalogs; follow [UI conventions](../docs/engineering/frontend-ui-conventions.md) and [popup standards](../docs/ui/popup-standards.md).
- Proof: inspect neighboring `*.test.ts`/`*.test.tsx`; run the focused scenario from this directory using [CONTRIBUTING.md](../CONTRIBUTING.md#frontend). Defects follow the [regression-first workflow](../docs/agent-workflows/bug-fixes.md).
- Visual states: follow [headless frontend evidence](../docs/agent-workflows/frontend-evidence.md) for mock setup, screenshots and source-bound artifacts; record viewport/theme/locale/interaction. Preserve trace, evidence paths and next action in the [handoff](../docs/agent-workflows/task-handoff.md).
