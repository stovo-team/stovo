# End-to-end tests

Playwright runs the real frontend in local mock mode. The tests use synthetic demo data and do not require a backend, shared environment, or real media devices.

## Setup

Install the frontend and E2E dependencies, then install Chromium once:

```sh
cd frontend && npm ci
cd ../e2e && npm ci
npx playwright install chromium
```

Start the mock frontend in a separate terminal:

```sh
cd frontend && npm run dev:mock
```

The mock server listens at `http://127.0.0.1:5174`.

## Visual checks

Run the visual baselines and the local mock browser journeys, including the active-call screenshot captured by the existing multi-tab call test:

```sh
cd e2e
E2E_BASE_URL=http://127.0.0.1:5174 npm run test:visual
```

The test compares chat on desktop and mobile, Storage's image preview, Canvas with a whiteboard, and an active group call on desktop and mobile. Playwright saves expected, actual, and diff images when a comparison fails.

## Updating visual baselines

Only update snapshots for an intentional UI change. Run the explicit update command, inspect every changed PNG and any reported diff, then run comparison mode before committing:

```sh
cd e2e
E2E_BASE_URL=http://127.0.0.1:5174 npm run test:visual:update
E2E_BASE_URL=http://127.0.0.1:5174 npm run test:visual
```

Commit reviewed snapshot changes with the UI or test change that explains them. CI and normal test runs compare against committed baselines and never rewrite them.
