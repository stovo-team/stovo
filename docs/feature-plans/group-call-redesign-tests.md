---
title: "Group call presentation redesign test plan"
type: test-plan
---

# Group call presentation redesign test plan

| Scenario / invariant | Test layer | Evidence |
| --- | --- | --- |
| A shared presentation remains the primary 16:9 stage; participant tiles remain 16:9 in a right rail on wide layouts | Component + CSS contract | Render a sharing grid and assert stage/participant DOM roles and CSS grid placement/aspect ratio |
| Narrow layouts put small participant tiles below the presentation without stretching them | CSS contract | Assert the responsive sharing layout changes to presentation-first rows and horizontal participant overflow |
| Desktop group sharing activates the full-screen call surface; non-sharing calls remain standard popups | Component/source contract | Assert call class composition follows group sharing state independently of mobile viewport |
| Invite and call-control buttons are compact in the group popup | CSS contract | Assert group call button dimensions and invite sizing are below the previous 48px baseline |
| Audio settings remain the same dialog and layer above the full-screen call | CSS contract | Assert the existing audio popup styles are retained and the settings backdrop z-index exceeds the call surface |
| Media refs, speaking state, and existing compact/mobile call behavior remain intact | Existing component suite | Run focused participant-grid and call UI tests |
