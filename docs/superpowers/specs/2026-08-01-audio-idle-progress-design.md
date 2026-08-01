# Audio idle progress and duration

## Goal

Make an unplayed audio-message attachment communicate its playback affordances
immediately: its progress track is visible and it shows the real total duration
as `0:00 / m:ss` before playback begins.

## Design

The existing `AudioPlayer` remains the only presentation and playback owner.
It already probes and caches media duration without starting playback. The
component will continue using that cached/probed duration while no playback
session exists, so the initial time is position zero and total duration is
available as soon as metadata loads.

The idle waveform/progress track will have explicit styling that keeps the
track visible before a session is active. Its fill stays empty at zero percent.
Seeking remains disabled until a playable session reports seeking capability;
displaying duration does not make the attachment seekable early.

If duration metadata cannot be obtained, the established `0:00` fallback stays
in place. No placeholder or fabricated duration is shown.

## Validation

Add a component test that supplies a cached duration before rendering and
asserts the idle progress control is rendered with an empty fill and text
`0:00 / total`. Run the focused test and the frontend production build.
