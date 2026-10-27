# Page width priority test plan

Status: approved for implementation with the spec in [page-width-priority.md](../specs/page-width-priority.md).

| Acceptance ID | Scenario/input | Expected result | Proof layer | Check | Evidence |
| --- | --- | --- | --- | --- | --- |
| P1 | Open Plans in English/light mock mode at 2200×1100 and select Week | Calendar/main content reaches the right edge of the available Plans pane; its width exceeds 1200px | E2E + screenshot | `page-width-priority` | Before/after screenshots with viewport, theme, locale, and interaction metadata |
| C1 | Open a populated active chat at 1440×900 | Conversation remains fluid below 1400px and keeps the current two-pane layout | E2E | `page-width-priority` | Measured pane bounds |
| C2 | Open the same active chat at 2200×1100 | Conversation width is 1400px; chat list grows beyond its current 320px width; panes fill the chat layout | E2E + screenshot | `page-width-priority` | Before/after screenshots and measured pane bounds |
| R1 | Open a week calendar at 1440×900 and active chat at 390×844 | Week retains its 1200px minimum/scroll behavior; mobile chat remains viewport-sized with no horizontal document overflow | E2E | `page-width-priority` | Measured calendar and chat bounds |

Fixtures are the existing synthetic local mock data served by `E2E_MODE=mock`; tests use Chromium and make no backend calls. Screenshot cases use the default mock theme and locale, verified from the rendered page. The viewport and route interaction are recorded in the test output. No approved visual reference or pixel-diff baseline is required; screenshots are delivery evidence.

Required checks:

- `E2E_MODE=mock E2E_BASE_URL=http://127.0.0.1:5180 npx playwright test tests/page-width-priority.spec.ts` from `e2e`.
- `npm --prefix frontend test -- --run src/pages/PlansPage.test.ts src/pages/ChatsPage.width-layout.test.ts` from the repository root.
- `npm --prefix e2e run test:visual` using the dedicated visual configuration.
- `node e2e/tools/capture-evidence.mjs --task page-width-priority --output artifacts/agent-workflows/page-width-priority` from the repository root.
