import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, afterEach } from "vitest";
import { GuestParticipantTile } from "./GuestMeetingMedia";
import GuestMeetingConnectingScreen from "./GuestMeetingConnectingScreen";
import * as speaking from "../features/chats/calling/callSpeakingIndicator";

afterEach(() => vi.useRealTimers());

describe("guest call speaking presentation", () => {
  it("keeps the card and status active through the shared release grace period", () => {
    vi.useFakeTimers();
    const indicator = speaking.createCallSpeakingIndicator(() => undefined);
    indicator.update({ microphoneEnabled: true, level: speaking.CALL_SPEAKING_THRESHOLD });
    indicator.update({ microphoneEnabled: true, level: 0 });
    const markup = () => renderToStaticMarkup(<GuestParticipantTile label="Guest" hasVideo={false} speaking={speaking.isCallSpeakingActive(indicator.state)} />);
    expect(markup()).toContain("voice-participant-card is-speaking");
    expect(markup()).toContain('role="status">Speaking');
    vi.advanceTimersByTime(speaking.CALL_SPEAKING_RELEASE_DELAY_MS - 1);
    expect(markup()).toContain("is-speaking");
    vi.advanceTimersByTime(1);
    expect(markup()).not.toContain("is-speaking");
    expect(markup()).toContain('role="status">Connected');
  });

  it("never highlights a muted tile even with stale speaking state", () => {
    const markup = renderToStaticMarkup(<GuestParticipantTile label="Guest" hasVideo={false} muted speaking />);
    expect(markup).not.toContain("is-speaking");
    expect(markup).toContain('role="status">Muted');
  });

  it("uses the preview SVG arrow while connecting", () => {
    const markup = renderToStaticMarkup(<GuestMeetingConnectingScreen stovoSite="https://example.test" />);
    expect(markup).toContain("lucide-arrow-up-right");
    expect(markup).not.toContain("↗");
  });
});

it.each([false, true])("marks a speaking guest tile for its green border (camera=%s)", (hasVideo) => {
  const markup = renderToStaticMarkup(<GuestParticipantTile label="Guest" hasVideo={hasVideo} speaking />);
  expect(markup).toMatch(/class="voice-participant-card[^"]*\bis-speaking\b/);
  expect(renderToStaticMarkup(<GuestParticipantTile label="Guest" hasVideo={hasVideo} speaking={false} />)).not.toContain("is-speaking");
});
