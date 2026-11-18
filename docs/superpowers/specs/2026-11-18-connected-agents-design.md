---
title: "Connected Agents"
type: design
---

# Connected Agents

## Intent

Make agent setup understandable as one flow: name an agent, choose its provider, choose its Messenger access and Stovo Insight grant preferences, then get provider-specific connection and local Codex Bridge instructions.

## Goals

- Rename the admin surface and navigation entry to **Connected Agents**.
- Collect a nickname and explain that the agent is invoked as `@nickname`.
- Require an explicit provider choice.
- Put Messenger permissions, chat scope, and separately identified Stovo Insight grants in the create flow.
- Start with no chat access and no permissions selected. Space-wide Messenger access remains an explicit choice.
- After creation, show a clear onboarding sequence with the generated provider setup details and the copyable local Codex prompt.
- Keep English and Russian complete and responsive.

## Non-goals and security constraints

- Do not add or change backend grant semantics. The Insight choices in the create flow are setup preferences only; the authenticated Insight consent page remains the only place that issues these grants.
- Keep single-chat as the default Insight scope. Space scope continues to require its existing separate explicit confirmation.
- Do not automatically install, pair, start, or run the local Codex Bridge. Keep the existing local requirements, confirmation checkpoints, managed policy, gate, pairing-code, and revocation instructions in its prompt.
- Do not deploy.

## Approaches

1. Keep the current page and add more controls inline. This is the smallest change, but leaves setup details separated from creation and does not create a clear post-create journey.
2. Use a focused create step followed by an onboarding state in the same page. Reuse current connector APIs and setup materials; the Insight selections remain visibly preferences and are approved later in the existing consent flow. **Chosen:** it gives users a single setup journey without creating a second authority for grants.
3. Add backend-persisted Insight grant requests and/or a new combined consent endpoint. This could remember preferences but duplicates or alters an established consent boundary and is out of scope.

## Observable behavior

- The form requires nickname, provider, and at least one chat selection; each permission starts off. Selecting every chat is explicit.
- Nickname help shows the normalized `@nickname` that the agent will use.
- Insight grants are separately grouped and explained as choices to review in Insight consent, not grants applied by creating a Messenger agent. They start off.
- Successful creation opens onboarding with a numbered path, provider setup details, and Local Codex Bridge prerequisites and copyable prompt.
- Existing connector management, token visibility, enable/disable, editing, and revocation keep their current API behavior.

## Acceptance and test plan

- **CA-1 Create:** component tests prove provider selection, nickname helper, permissions, and no implicit chat or permission access; create submission sends only existing connector API fields.
- **CA-2 Insight:** component tests prove Insight grants are separate, initially off, passed to onboarding as preferences only, and never posted as MCP grants. Existing consent tests continue to prove single-chat default and explicit Space confirmation.
- **CA-3 Onboarding:** tests prove success transitions to onboarding, selected provider instructions and generated connection secrets appear, and the Codex Bridge prompt is copyable with existing safety requirements intact.
- **CA-4 Management:** existing edit, token, and revoke behaviors remain available after dismissing onboarding.
- **CA-5 Localization/responsiveness:** English/Russian catalog parity and responsive screenshots cover 1440x900 and 390x844 for both locales at minimum; run i18n audit and targeted frontend tests/build.

## Constraints and risks

- Provider labels and setup instructions use the existing provider model; transport semantics do not change.
- Insight grant preferences are transient through create-to-onboarding because the existing API has no field for them. The UI must state that consent itself happens in Insight and must not imply these checkboxes already grant access.
- The local Codex Bridge can expose local files and actions; its existing prompt must remain intact and visible in onboarding behind explicit user copy/open actions.
