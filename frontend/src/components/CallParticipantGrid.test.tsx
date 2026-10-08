import { act } from "react";
import { readFileSync } from "node:fs";
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

function styleRules(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")), (match) => match[1]).join("\n");
}

describe("shared call participant presentation", () => {
  it("places 16:9 avatar/video participants in a desktop screen-share side rail", () => {
    const screenTrack = { readyState: "live", kind: "video", getSettings: () => ({ width: 1920, height: 1080 }), addEventListener() {}, removeEventListener() {} };
    const screenStream = { getVideoTracks: () => [screenTrack] } as unknown as MediaStream;
    const container = renderGrid({
      localStream: null,
      localScreenStream: screenStream,
      localUserLabel: "You",
      callType: "video",
      remoteMedia: [
        { userId: "Alex Morgan", stream: null as unknown as MediaStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false },
      ],
    });

    const grid = container.querySelector<HTMLElement>(".call-grid");
    const presenterTile = grid?.querySelector<HTMLElement>(".call-grid__tile--screen");
    expect(presenterTile).not.toBeNull();
    expect(presenterTile?.style.gridColumn).not.toBe("1 / -1");
    expect(grid?.classList.contains("call-grid--screen-share")).toBe(true);
    const rail = grid?.querySelector<HTMLElement>(".call-grid__participant-rail");
    expect(rail).not.toBeNull();
    expect(rail?.querySelector(".call-grid__participant-pin[data-participant-id='You']")).not.toBeNull();
    const remoteRail = rail?.querySelector<HTMLElement>(".call-grid__remote-rail");
    expect(remoteRail).not.toBeNull();
    const remote = remoteRail?.querySelector<HTMLElement>('[data-participant-id="Alex Morgan"]');
    expect(remote?.style.aspectRatio).toBe("16 / 9");
    expect(remote?.querySelector(".call-grid__avatar")).not.toBeNull();

    const css = readFileSync("src/styles.css", "utf8");
    expect(styleRules(css, ".call-grid--screen-share")).toMatch(/grid-template-columns:/);
    expect(styleRules(css, ".call-grid--screen-share")).toMatch(/grid-template-columns:\s*minmax\(120px,\s*22%\)\s+minmax\(0,\s*1fr\)/);
    expect(styleRules(css, ".call-grid--screen-share > .call-grid__tile--screen")).toMatch(/grid-column:\s*2/);
    expect(styleRules(css, ".call-grid__participant-rail")).toMatch(/grid-column:\s*1/);
    expect(styleRules(css, ".call-grid__participant-rail")).toMatch(/overflow:\s*hidden/);
    expect(styleRules(css, ".call-grid__remote-rail")).toMatch(/overflow-y:\s*auto/);
    expect(css).toMatch(/@media[^{}]*\(max-width:\s*720px\)[\s\S]*?\.call-grid--screen-share\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto/);
    expect(css).toMatch(/\.call-grid--screen-share \.call-grid__remote-rail\s*\{[^}]*overflow-x:\s*auto/);
  });

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
    expect(tile?.querySelector(".speaking-wave-badge")).toBeNull();
  });

  it("adds the speaking halo around avatars and an outline around speaking tiles", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(styleRules(css, ".call-grid__tile.is-speaking")).toMatch(/outline:\s*1px\s+solid\s+#22c55e/);
    expect(styleRules(css, ".call-grid__tile.is-speaking .call-grid__avatar-circle")).toMatch(/box-shadow:\s*0\s+0\s+0\s+2px\s+rgba\(34,\s*197,\s*94,\s*\.82\)/);
    expect(styleRules(css, ".call-grid__tile.is-speaking .call-grid__avatar-circle")).not.toMatch(/(?:4px|7px)/);

    const container = renderGrid({
      localStream: null,
      remoteMedia: [{ userId: "wave-speaker", stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false }],
      localUserLabel: "You",
      callType: "audio",
      speakingUserIds: ["wave-speaker"],
    });
    const speakingTile = container.querySelector(".call-grid__tile--remote.is-speaking");
    expect(speakingTile?.querySelector('[role="status"]')?.textContent).toBe("Speaking");
    expect(speakingTile?.querySelector(".speaking-wave-badge")).toBeNull();
    expect(speakingTile?.querySelector(".call-grid__avatar-circle")).not.toBeNull();
  });

  it("does not show the speaking halo while connected but quiet or before the call connects", () => {
    const connected = renderGrid({
      localStream: null,
      localUserLabel: "You",
      remoteMedia: [{ userId: "quiet-peer", stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false }],
      callType: "audio",
      speakingUserIds: [],
      isCallConnected: true,
    });
    const connectedTile = connected.querySelector(".call-grid__tile--remote");
    expect(connectedTile?.querySelector('[role="status"]')?.textContent).toBe("Connected");
    expect(connectedTile?.classList.contains("is-speaking")).toBe(false);
    expect(connectedTile?.querySelector(".speaking-wave-badge")).toBeNull();

    const preCall = renderGrid({
      localStream: null,
      localUserLabel: "You",
      remoteMedia: [{ userId: "joining-peer", stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false }],
      callType: "audio",
      speakingUserIds: ["joining-peer"],
      isCallConnected: false,
    });
    const preCallTile = preCall.querySelector(".call-grid__tile--remote");
    expect(preCallTile?.classList.contains("is-speaking")).toBe(false);
    expect(preCallTile?.querySelector("[role=status]")).toBeNull();
    expect(preCallTile?.querySelector(".speaking-wave-badge")).toBeNull();
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
    expect(localTile?.querySelector(".speaking-wave-badge")).toBeNull();
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
    let closeFocus: (() => void) | undefined;
    const container = renderGrid({
      localStream: null,
      localUserLabel: "You",
      callType: "video",
      remoteMedia: [
        { userId: "Alex Morgan", stream: null as unknown as MediaStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false },
        { userId: "Maya Chen", stream: { getVideoTracks: () => [endedTrack] } as unknown as MediaStream, screenStream: null, hasVideo: true, hasAudio: true, hasScreenShare: false },
        { userId: "Sam Rivera", stream: { getVideoTracks: () => [liveTrack] } as unknown as MediaStream, screenStream: null, hasVideo: true, hasAudio: true, hasScreenShare: false },
      ],
      onFocusChange: (focused, close) => { if (focused) closeFocus = close; },
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
    expect(maya?.style.aspectRatio).toBe("16 / 9");
    expect(maya?.querySelector(".call-grid__avatar")).not.toBeNull();
    expect(maya?.querySelector("video")).toBeNull();
    act(() => maya?.click());
    main = container.querySelector('[data-focus-main="Maya Chen"]');
    expect(main).not.toBeNull();
    expect(main?.querySelector(".call-grid__avatar")).not.toBeNull();
    expect(main?.querySelector("video")).toBeNull();

    expect(container.querySelector('button[aria-label="Close participant focus"]')).toBeNull();
    expect(closeFocus).toBeTypeOf("function");
    act(() => closeFocus?.());
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

  it("renders the shared screen as a passive full-view surface rather than a clickable participant", () => {
    const screenTrack = { readyState: "live", kind: "video", getSettings: () => ({ width: 1920, height: 1080 }), addEventListener() {}, removeEventListener() {} };
    const screenStream = { getVideoTracks: () => [screenTrack] } as unknown as MediaStream;
    const container = renderGrid({
      localStream: null,
      localScreenStream: screenStream,
      callType: "video",
      remoteMedia: [{ userId: "Alex", stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false }],
    });

    const screenTile = container.querySelector<HTMLElement>(".call-grid__tile--screen");
    expect(screenTile).not.toBeNull();
    expect(screenTile?.tagName).not.toBe("BUTTON");
    expect(screenTile?.getAttribute("role")).not.toBe("button");
    expect(screenTile?.tabIndex).toBeLessThan(0);
  });

});
