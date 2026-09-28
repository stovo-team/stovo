import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import CallParticipantGrid from "./CallParticipantGrid";

const mountedRoots: Root[] = [];

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => root?.unmount());
  }
  document.body.innerHTML = "";
});
function renderGrid(props: React.ComponentProps<typeof CallParticipantGrid>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => root.render(<CallParticipantGrid {...props} />));
  return container;
}

const emptyStream = {} as MediaStream;

describe("shared call participant presentation", () => {
  it("shows the same speaking status on local and remote participants", () => {
    const container = renderGrid({
      localStream: null,
      remoteMedia: [
        { userId: "speaker", stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false },
        { userId: "speaker-two", stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false },
        { userId: "listener", stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false, isMuted: true },
      ],
      localUserLabel: "You",
      callType: "audio",
      isLocalSpeaking: true,
      speakingUserIds: ["speaker", "speaker-two"],
    });

    const speakingTiles = Array.from(container.querySelectorAll(".call-grid__tile.is-speaking"));
    expect(speakingTiles).toHaveLength(3);
    expect(speakingTiles.map((tile) => tile.querySelector("[role=\"status\"]")?.textContent)).toEqual(["Speaking", "Speaking", "Speaking"]);
    const mutedTile = Array.from(container.querySelectorAll(".call-grid__tile--remote")).find((tile) => tile.querySelector(".call-grid__label")?.textContent === "listener");
    expect(mutedTile?.classList.contains("is-speaking")).toBe(false);
    expect(mutedTile?.querySelector('[role="status"]')?.textContent).toBe("Muted");
  });

  it("shows speaking on a video tile and keeps its label accessible", () => {
    const videoTrack = { readyState: "live", kind: "video", addEventListener() {}, removeEventListener() {} };
    const stream = { getVideoTracks: () => [videoTrack] } as unknown as MediaStream;
    const container = renderGrid({
      localStream: null,
      remoteMedia: [
        { userId: "video-speaker", stream, screenStream: null, hasVideo: true, hasAudio: true, hasScreenShare: false },
      ],
      callType: "video",
      speakingUserIds: ["video-speaker"],
    });

    const tile = container.querySelector(".call-grid__tile.is-speaking");
    expect(tile?.textContent).toContain("video-speaker");
    const status = tile?.querySelector("[role=\"status\"]");
    expect(status).not.toBeNull();
    expect(status?.textContent).toContain("Speaking");
    expect(tile?.querySelector(".speaking-wave-badge, .voice-video-speaking-border")).not.toBeNull();
  });

  it("does not show the local participant as speaking while the microphone is muted", () => {
    const container = renderGrid({
      localStream: null,
      remoteMedia: [],
      callType: "audio",
      isLocalSpeaking: true,
      isLocalMuted: true,
    });

    const localTile = container.querySelector(".call-grid__tile--local");
    expect(localTile?.classList.contains("is-speaking")).toBe(false);
    expect(localTile?.querySelector('[role="status"]')?.textContent).toBe("Muted");
  });

  it("does not show the only remote participant as speaking through the peer fallback when muted", () => {
    const container = renderGrid({
      localStream: null,
      remoteMedia: [
        { userId: "muted-peer", stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false, isMuted: true },
      ],
      callType: "audio",
      isPeerSpeaking: true,
    });

    const tile = container.querySelector(".call-grid__tile--remote");
    expect(tile?.classList.contains("is-speaking")).toBe(false);
    expect(tile?.querySelector('[role="status"]')?.textContent).toBe("Muted");
  });

  it.each([
    { description: "null stream", stream: null, hasVideo: false },
    {
      description: "ended video stream",
      stream: { getVideoTracks: () => [{ readyState: "ended", kind: "video" }] } as unknown as MediaStream,
      hasVideo: true,
    },
  ])("falls back to an avatar for a remote participant with a $description", ({ stream, hasVideo }) => {
    const container = renderGrid({
      localStream: null,
      localScreenStream: {
        getVideoTracks: () => [{ readyState: "live", kind: "video", getSettings: () => ({ width: 1920, height: 1080 }) }],
      } as unknown as MediaStream,
      remoteMedia: [{
        userId: "offline-camera",
        stream: stream as MediaStream,
        screenStream: null,
        hasVideo,
        hasAudio: true,
        hasScreenShare: false,
      }],
      localUserLabel: "You",
      callType: "video",
    });

    const participant = container.querySelector(".call-grid__tile--remote");
    expect(container.querySelector(".call-grid--presenting")).not.toBeNull();
    expect(participant?.querySelector(".call-grid__avatar")).not.toBeNull();
    expect(participant?.querySelector("video")).toBeNull();
  });

  it("focuses participants inline, switches focus, and returns to the grid with avatar fallbacks", () => {
    const endedTrack = { readyState: "ended", kind: "video" };
    const liveTrack = { readyState: "live", kind: "video", addEventListener() {}, removeEventListener() {} };
    const container = renderGrid({
      localStream: null,
      localUserLabel: "You",
      callType: "video",
      remoteMedia: [
        { userId: "Alex Morgan", stream: null as unknown as MediaStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false },
        { userId: "Maya Chen", stream: { getVideoTracks: () => [endedTrack] } as unknown as MediaStream, screenStream: null, hasVideo: true, hasAudio: true, hasScreenShare: false },
        { userId: "Sam Rivera", stream: { getVideoTracks: () => [liveTrack] } as unknown as MediaStream, screenStream: null, hasVideo: true, hasAudio: true, hasScreenShare: false },
      ],
    });

    expect(container.querySelectorAll(".call-grid__tile")).toHaveLength(4);
    act(() => container.querySelector<HTMLElement>('.call-grid__tile--remote .call-grid__label')?.click());
    let main = container.querySelector('[data-focus-main="Alex Morgan"]');
    expect(main).not.toBeNull();
    expect(main?.closest(".call-grid")).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(main?.querySelector(".call-grid__avatar")).not.toBeNull();
    expect(main?.querySelector("video")).toBeNull();

    const maya = container.querySelector<HTMLButtonElement>('[data-focus-participant="Maya Chen"]');
    expect(maya).not.toBeNull();
    expect(maya?.style.aspectRatio).toBe("1 / 1");
    expect(maya?.querySelector(".call-grid__avatar")).not.toBeNull();
    expect(maya?.querySelector("video")).toBeNull();
    act(() => maya?.click());
    main = container.querySelector('[data-focus-main="Maya Chen"]');
    expect(main).not.toBeNull();
    expect(main?.querySelector(".call-grid__avatar")).not.toBeNull();
    expect(main?.querySelector("video")).toBeNull();

    const back = container.querySelector<HTMLButtonElement>('button[aria-label="Close participant focus"]');
    expect(back).not.toBeNull();
    act(() => back?.click());
    expect(container.querySelector("[data-focus-main]")).toBeNull();
    expect(container.querySelectorAll(".call-grid__tile")).toHaveLength(4);
  });

  it("keeps focused and unselected audio streams mounted without duplicating selected video audio", () => {
    const selectedAudioTrack = { readyState: "live", kind: "audio" };
    const selectedVideoTrack = { readyState: "live", kind: "video", addEventListener() {}, removeEventListener() {} };
    const backgroundAudioTrack = { readyState: "live", kind: "audio" };
    const selectedStream = {
      getVideoTracks: () => [selectedVideoTrack],
      getAudioTracks: () => [selectedAudioTrack],
      getTracks: () => [selectedVideoTrack, selectedAudioTrack],
    } as unknown as MediaStream;
    const backgroundAudioStream = {
      getVideoTracks: () => [],
      getAudioTracks: () => [backgroundAudioTrack],
      getTracks: () => [backgroundAudioTrack],
    } as unknown as MediaStream;
    const container = renderGrid({
      localStream: null,
      localUserLabel: "You",
      callType: "video",
      remoteMedia: [
        { userId: "video-speaker", stream: selectedStream, screenStream: null, hasVideo: true, hasAudio: true, hasScreenShare: false },
        { userId: "audio-listener", stream: backgroundAudioStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false },
      ],
    });

    const selectedVideo = container.querySelector(".call-grid__tile--remote video");
    expect(selectedVideo).not.toBeNull();
    const backgroundAudioBeforeFocus = Array.from(container.querySelectorAll<HTMLAudioElement>("audio"))
      .find((audio) => audio.srcObject === backgroundAudioStream);
    expect(backgroundAudioBeforeFocus).not.toBeNull();

    act(() => container.querySelector<HTMLElement>('.call-grid__tile--remote .call-grid__label')?.click());
    const focusedVideoMain = container.querySelector<HTMLElement>('[data-focus-main="video-speaker"]');
    expect(focusedVideoMain).not.toBeNull();
    const focusedVideo = focusedVideoMain?.querySelector<HTMLVideoElement>("video");
    expect(focusedVideo?.srcObject).toBe(selectedStream);
    expect(focusedVideo?.muted).toBe(true);
    expect(focusedVideoMain?.querySelector("audio")).toBeNull();
    const backgroundAudioAfterFocus = Array.from(container.querySelectorAll<HTMLAudioElement>("audio"))
      .find((audio) => audio.srcObject === backgroundAudioStream);
    expect(backgroundAudioAfterFocus).toBe(backgroundAudioBeforeFocus);
    expect(backgroundAudioAfterFocus?.isConnected).toBe(true);
    expect(backgroundAudioAfterFocus?.autoplay).toBe(true);
    expect(container.querySelectorAll("audio")).toHaveLength(1);
  });

  it("keeps the selected audio-only participant audible while focused", () => {
    const audioTrack = { readyState: "live", kind: "audio" };
    const videoTrack = { readyState: "live", kind: "video", addEventListener() {}, removeEventListener() {} };
    const selectedAudioStream = {
      getVideoTracks: () => [],
      getAudioTracks: () => [audioTrack],
      getTracks: () => [audioTrack],
    } as unknown as MediaStream;
    const videoStream = {
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [],
      getTracks: () => [videoTrack],
    } as unknown as MediaStream;
    const container = renderGrid({
      localStream: null,
      localUserLabel: "You",
      callType: "video",
      remoteMedia: [
        { userId: "audio-only", stream: selectedAudioStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false },
        { userId: "video-peer", stream: videoStream, screenStream: null, hasVideo: true, hasAudio: true, hasScreenShare: false },
      ],
    });

    const selectedAudioBeforeFocus = container.querySelector<HTMLAudioElement>("audio.call-grid__audio");
    expect(selectedAudioBeforeFocus?.srcObject).toBe(selectedAudioStream);
    act(() => container.querySelector<HTMLElement>('.call-grid__tile--remote .call-grid__label')?.click());

    const main = container.querySelector('[data-focus-main="audio-only"]');
    expect(main).not.toBeNull();
    expect(main?.querySelector(".call-grid__avatar")).not.toBeNull();
    const selectedAudioAfterFocus = container.querySelector<HTMLAudioElement>("audio.call-grid__audio");
    expect(selectedAudioAfterFocus).toBe(selectedAudioBeforeFocus);
    expect(selectedAudioAfterFocus?.srcObject).toBe(selectedAudioStream);
    expect(selectedAudioAfterFocus?.isConnected).toBe(true);
    expect(container.querySelectorAll("audio")).toHaveLength(1);
  });
});
