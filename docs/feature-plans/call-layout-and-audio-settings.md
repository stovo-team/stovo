---
title: "Call layout and audio settings plan"
type: feature-plan
---

# Call layout and audio settings plan

## User problem

Call layouts stretch video across wide stages, use inconsistent speaking visuals, and hide useful audio controls behind redundant menus. Users cannot tune speaking sensitivity even though call activity detection already uses a shared threshold.

## Scope and observable behavior

- Keep camera and avatar stages centered within a 16:9 maximum frame; preserve source video aspect ratios so portrait feeds use less width and fill the available height.
- Present screen shares in a 19:9 frame and contain the source image.
- Use the shared green speaking outline and avatar ring in direct, group, voice-channel, and guest calls.
- Open call settings directly from a gear control. Group microphone input and processing controls clearly, keep switches unboxed, and use a round subdued close button.
- Expose working echo cancellation, noise suppression, input gain, output volume, and speaking sensitivity controls. Sensitivity changes the activity detector threshold.
- Show the start-sharing icon while screen sharing is off, across call types.

## Constraints and decisions

- Retain the existing browser media constraints and controller settings pipeline for processing controls.
- Preserve 1 second speaking release grace and use 8 as the default activity threshold; sensitivity is configurable per call session in the range 2–24.
- Keep source media aspect ratio with `object-fit: contain`; stages constrain their largest dimension instead of stretching feeds.
- No server schema change is needed for the session-level sensitivity setting.

