---
title: "Agent workflow implementation decisions"
type: engineering-plan
---

# Agent workflow implementation decisions

See the [program](agent-workflow-program.md) for the approved design and implementation sequence.

## Dependency/reuse walkthroughs

A small popup spacing change starts with existing PopupDialog/PopupField primitives and shared tokens. No new dependency or external package comparison is needed when those already satisfy the requirement.

For deterministic browser testing, the installed Playwright 1.62.1 and existing Vite mock mode already supply the required server ownership, headless browser, assertions and reports. Another testing framework would duplicate those capabilities. New workflow validators use Node 22 built-ins for a finite record format; a general JSON Schema engine is not required yet. Known upstream advisory status is not established by package popularity; dependency upgrades still require the task-specific review.

The application loads Material Symbols from Google Fonts. Blocking that request exposed the external asset rather than establishing an offline baseline. The test harness therefore vendors the same font and its Apache 2.0 license, pins its upstream URL and content hash, and serves it only in test HTML. This adds about 948 KiB of test data, no production bundle bytes. Upstream license: https://github.com/google/material-design-icons/blob/master/LICENSE . Existing production font behavior remains outside this program's scope.

## Reuse assessment

The source-bound evidence record validator could be useful to another repository, but its schema and delivery policy are still Stovo-specific. Keep it internal until a real second consumer exercises the interface. Current extraction outcome: no standalone package. A future proposal must identify that consumer, remove product coupling, preserve tests/provenance and assign maintenance before another repository is created.

## UI observations during scenario development

History-load errors were stored but not displayed on ChatsPage. A browser regression test failed before the fix; the actual error banner and retry now reuse existing styles and translated strings. Mock state remains guarded by the existing dev-only dynamic installation path.

On mobile, navigation intentionally hides while viewing a chat; the visible back button is the correct contract. Section-settings mouse activation can be intercepted by its heading; the keyboard path works. This existing pointer issue and observed theme contrast should be investigated independently with screenshots before proposing fixes or accepting design references. They are not silently certified by successful functional screenshots.
