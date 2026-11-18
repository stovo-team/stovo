---
title: "Connected Agents Implementation Plan"
type: implementation-plan
---

# Connected Agents Implementation Plan

**Goal:** Replace the connector-oriented admin UI with a localized Connected Agents create and onboarding flow without changing server authorization semantics.

**Architecture:** Keep `MCPConnectorsPanel` and the existing create/edit/token APIs. Add explicit provider, nickname/alias, and least-privilege chat and Messenger permission state. Carry separate Insight grant preferences only across the successful create-to-onboarding transition; do not send them to Messenger APIs. Reuse `CodexBridgeSetupPanel` and the existing consent/revocation pages.

**Spec:** `docs/superpowers/specs/2026-11-18-connected-agents-design.md`

## Global constraints

- Do not modify backend/API grant semantics.
- Keep all Messenger permissions and chat scopes unselected by default; broad Space scope requires an explicit selection.
- Insight grants only become effective through the authenticated existing consent flow; Space scope there remains separately confirmed.
- Local bridge installation, pairing, and local Codex actions require the user's explicit actions and approvals already described by the guarded prompt.
- English and Russian catalogs remain shape-compatible.
- Do not deploy.

## Files

- `frontend/src/components/MCPConnectorsPanel.tsx`: create state, post-create onboarding, and management return path.
- `frontend/src/components/MCPConnectorsPanel.test.tsx`: create defaults, provider selection, explicit permissions, onboarding, and localization behavior.
- `frontend/src/pages/AdminMcpPage.tsx` and English/Russian admin strings: rename page and navigation surface.
- `frontend/src/config/strings/english.ts`, `russian.ts`: translated labels, helper text, permissions, instructions, and statuses.
- `frontend/src/styles/storage-and-admin.css`, `frontend/src/styles/mcp-connectors.css`: responsive create/onboarding layouts using existing design tokens.
- Relevant UI tests or visual scenarios if the existing harness can reach the admin route.

## Task 1: Lock the create and security behavior

- Add component tests for the nickname-to-`@alias` helper, explicit provider selector, empty chat and permission defaults, and a create request containing only the existing API fields.
- Add tests for separately displayed Insight grants and prove they are not sent in the MCP create request.
- Run the focused component test and verify the new expectations fail because provider selection, zero-access defaults, and Insight choices do not exist yet.
- Implement the minimum create form changes and verify the focused tests pass.

## Task 2: Add post-create onboarding and preserve management

- Add tests that successful create transitions from the form to onboarding and that selected provider instructions and the generated connection details appear.
- Assert onboarding includes the existing Codex Bridge prompt, local prerequisites, and explicit approval boundary. Reuse `CodexBridgeSetupPanel`; do not fork its prompt or alter its checks.
- Assert dismissing onboarding returns to the Connected Agents list with configure/revoke/token actions available.
- Run focused tests and implement the onboarding state/flow.

## Task 3: Localize and style the complete journey

- Extend both typed catalogs for Connected Agents, nickname helper, provider choices, Insight preference explanations, onboarding steps, and bridge prerequisites.
- Add layout rules for desktop and narrow screens using tokens and existing form/panel styles.
- Run `npm run check:i18n`, catalog parity, focused component tests, and relevant style tests.
- Capture English/Russian screenshots at 1440x900 and 390x844 through the existing visual harness if available; inspect the output.

## Task 4: Final verification and review

- Run the full frontend suite and TypeScript production build.
- Review the diff against CA-1 through CA-5; verify the API payload, Insight consent boundary, explicit Space confirmation, and bridge prompt are unchanged in substance.
- Do not deploy.
