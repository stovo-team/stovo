---
title: "Unified minimized calls"
type: plan
---

# Unified minimized calls

Problem: DM/group desktop popups and voice/mobile header strips differ and can coexist.
Scope: one CallFeature-owned minimized surface for all calls and routes. Expanded calls retain their existing behavior.
Behavior: right-aligned, content-width audio pill; expand before title/duration; microphone, speaker mute, end buttons after it, each 34px square. A live camera changes the pill into a 16:9 preview of the active/last speaking camera participant; live screen shares take priority. Title/duration and controls overlay the preview. Long titles truncate only at the viewport limit. Speaker mute uses soundDisabled without changing output volume. Preview video is muted so existing remote audio remains the sole audio playback source.

Test plan (component/DOM): verify control order/actions and muted states; audio-only has no video; remote/local screen share outranks cameras; speaker changes update camera selection, silence retains the last speaker, ended/muted tracks and departed participants fall back to available live media; local mirroring applies only to cameras; preview never plays duplicate audio. Integration tests render CallFeature for DM/group/voice, mobile/desktop, chats/other routes and verify exactly one minimized surface and no minimized popup. CSS contract checks verify 34px controls, content width, right alignment, 16:9 frame and transparent metadata overlay. Run focused frontend tests, TypeScript/build and relevant lint.
