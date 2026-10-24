---
title: "Call layout and audio settings test plan"
type: test-plan
---

# Call layout and audio settings test plan

| Scenario / risk | Layer | Proof |
| --- | --- | --- |
| Camera frames preserve native proportions and stage 16:9 bounds; portrait sources remain narrow | Component / CSS contract | Assert shared grid tile/frame styles and portrait metadata layout |
| Screen-share frame uses 19:9 and contains source | Component / CSS contract | Assert 19:9 presenter style and contained screen video |
| Speaking sensitivity honors chosen threshold and default remains compatible with guest meetings | Unit | Threshold boundary and release behavior tests |
| Speaking state reaches all participant tiles in direct/group calls | Component | Assert existing shared speaking state renders green-outline class on active tile |
| Audio switches and sliders patch real settings | Component | Assert controls emit exact settings patches, including echo/noise/sensitivity |
| Voice-channel settings open directly from gear and share icon has correct idle state | Component | Assert no one-item overflow menu and correct button label/icon state |
| Disabled browser capabilities remain disabled and visible | Component | Assert capability-gated controls stay disabled |

