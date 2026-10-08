import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { GuestParticipantTile } from "./GuestMeetingMedia";

it.each([false, true])("marks a speaking guest tile for its green border (camera=%s)", (hasVideo) => {
  const host = document.createElement('div'); const root = createRoot(host);
  act(() => root.render(<GuestParticipantTile label="Guest" hasVideo={hasVideo} speaking />));
  expect(host.querySelector('.voice-participant-card.is-speaking')).not.toBeNull();
  act(() => root.render(<GuestParticipantTile label="Guest" hasVideo={hasVideo} speaking={false} />));
  expect(host.querySelector('.is-speaking')).toBeNull();
  act(() => root.unmount());
});
