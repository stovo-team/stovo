---
title: "Call, Storage and Plans UI fixes test plan"
type: test-plan
---

# Call, Storage and Plans UI fixes test plan

| Scenario / invariant | Test layer | Evidence |
| --- | --- | --- |
| Toggling call settings, using an audio setting, choosing a device, and changing a camera preference do not dismiss the dialog | Component interaction | Render `CallSettingsDialog`, dispatch the real pointer and click interactions (including the portaled device option), assert `onClose` is untouched and the dialog remains mounted |
| Split microphone, speaker and camera dropdowns have visible separators/borders; active call controls have no mouse halo but keyboard focus remains visible | CSS/component contract | Assert dropdown border rules and distinct `:focus-visible` behavior for active controls |
| Recording control is compact and the captions action uses the short label | Component + CSS contract | Assert rendered captions copy and the recording button dimensions stay below the current 48px control size |
| Meeting invitation actions render “Join” and “In Plans” in English and their requested Russian equivalents | Component + locale contract | Render the guest-meeting card with both locale dictionaries and assert the exact button labels |
| Storage source list can collapse/expand without losing the selected chat; the main content receives the remaining width | Component + CSS contract | Toggle the accessible collapse button and assert state/selection plus collapsed grid columns |
| Plans event list can collapse/expand without losing the selected event; filters move below the date header when collapsed | Component + CSS contract | Toggle the sidebar, assert selected plan remains selected, filter navigation is in the main header flow, and the collapsed grid expands |
| Plans weekdays and month names follow the selected app language; date header is shorter | Locale/component + CSS contract | Format a fixed date under `en` and `ru`, assert localized names, and assert a reduced header minimum height |
| Existing call, Storage and Plans behaviors remain intact | Focused regression suites | Run affected call settings/call controls, FilesPage and PlansPage tests, then frontend lint and build |

## Regression test order

1. Add interaction and rendering regressions for call dialogs, device menus and meeting labels; run them and record the expected failures before implementation.
2. Add Storage and Plans collapse/localization regressions; run them and record the expected failures before implementation.
3. Implement the smallest changes required by each failing regression, re-run the same tests unchanged, then run the broader frontend checks listed above.
