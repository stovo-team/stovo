---
title: "Voice Channel Screen Share Layout Test Plan"
type: test-plan
---

# Voice Channel Screen Share Layout Test Plan

| Scenario | Layer | Proof |
| --- | --- | --- |
| Screen share layout puts participant rail before the presenter in desktop visual order and pins it to the left | Component / CSS contract | Assert grid columns and explicit rail placement; stage uses non-scrolling overflow |
| Narrow screen places participant rail beneath the presenter | CSS contract | Assert responsive class/rule switches the grid to stacked rows |
| More participants remain reachable without making the whole stage scroll | CSS contract | Assert rail alone has overflow scrolling and bounded height |
| Expand control reports expanded state and invokes its callback | Component | Assert accessible label/pressed state changes and callback fires |
| Expanded voice channel hides sidebar and grows the call pane | Layout contract | Assert expanded shell class and grid columns omit the sidebar |
| Voice status avatar size increases and name-to-people spacing decreases | CSS contract | Assert updated avatar dimensions and tighter chat-list copy gap |
| Screen-share control stays in the bottom call dock | Component / CSS contract | Assert share control is within the bottom toolbar and dock remains bottom aligned |

Browser-owned sharing chrome is outside the app DOM and is not repositionable by application CSS.
