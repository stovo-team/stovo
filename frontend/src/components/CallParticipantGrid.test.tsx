import { readCssSource } from "../test/cssSource";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CallParticipantGrid from "./CallParticipantGrid";

const mountedRoots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => root?.unmount());
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
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
  it("keeps a lone participant tile compact on a large call stage", () => {
    const stage = { width: 1365, height: 756 };
    vi.stubGlobal("ResizeObserver", class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        const rect = { x: 0, y: 0, top: 0, left: 0, width: stage.width, height: stage.height, right: stage.width, bottom: stage.height, toJSON: () => ({}) } as DOMRectReadOnly;
        const entry = { target, contentRect: rect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] } as unknown as ResizeObserverEntry;
        this.callback([entry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    });

    const container = renderGrid({ localStream: null, remoteMedia: [], callType: "audio" });
    const grid = container.querySelector<HTMLElement>(".call-grid")!;
    const width = Number.parseFloat(grid.style.getPropertyValue("--gallery-width"));
    const height = Number.parseFloat(grid.style.getPropertyValue("--gallery-height"));

    expect(width).toBeLessThanOrEqual(560);
    expect(width / height).toBeCloseTo(16 / 9);
  });

  it("slightly narrows the initial single-user group-call tile", () => {
    const container = renderGrid({
      localStream: null,
      remoteMedia: [],
      localUserLabel: "You",
      callType: "video",
      isGroupCall: true,
    });

    const grid = container.querySelector<HTMLElement>(".call-grid");
    const css = readCssSource("src/styles.css");
    expect(grid?.classList.contains("call-grid--single-group-participant")).toBe(true);
    expect(styleRules(css, ".call-grid--single-group-participant > .call-grid__tile--local")).toMatch(/width:\s*92%/);
    expect(styleRules(css, ".call-grid--single-group-participant > .call-grid__tile--local")).toMatch(/justify-self:\s*center/);
  });

  it("keeps regular calls and populated group calls at their current tile size", () => {
    const regularCall = renderGrid({ localStream: null, remoteMedia: [], callType: "video" });
    const populatedGroupCall = renderGrid({
      localStream: null,
      remoteMedia: [{ userId: "Alex", stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false }],
      callType: "video",
      isGroupCall: true,
    });

    expect(regularCall.querySelector(".call-grid--single-group-participant")).toBeNull();
    expect(populatedGroupCall.querySelector(".call-grid--single-group-participant")).toBeNull();
  });

  it("leaves the self video unchanged when clicked and disables native video popouts", () => {
    const stream = { getVideoTracks: () => [{ readyState: "live" }] } as unknown as MediaStream;
    const focus = vi.fn();
    const container = renderGrid({ localStream: stream, remoteMedia: [], callType: "video", onFocusChange: focus });
    const tile = container.querySelector<HTMLElement>(".call-grid__tile--local")!;
    act(() => tile.click());
    expect(focus).not.toHaveBeenCalled();
    expect(tile.getAttribute("role")).toBeNull();
    expect(tile.querySelector("video")?.hasAttribute("disablepictureinpicture")).toBe(true);
  });
  it("keeps the shared presentation primary and places 16:9 participants in a desktop side rail", () => {
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
    expect(presenterTile?.style.gridColumn).toBe("1");
    expect(grid?.classList.contains("call-grid--screen-share")).toBe(true);
    const rail = grid?.querySelector<HTMLElement>(".call-grid__participant-rail");
    expect(rail).not.toBeNull();
    expect(rail?.querySelector(".call-grid__participant-pin[data-participant-id='You']")).not.toBeNull();
    const remoteRail = rail?.querySelector<HTMLElement>(".call-grid__remote-rail");
    expect(remoteRail).not.toBeNull();
    const remote = remoteRail?.querySelector<HTMLElement>('[data-participant-id="Alex Morgan"]');
    expect(remote?.style.aspectRatio).toBe("16 / 9");
    expect(remote?.querySelector(".call-grid__avatar")).not.toBeNull();

    const css = readCssSource("src/styles.css");
    expect(styleRules(css, ".call-grid--screen-share")).toMatch(/grid-template-columns:/);
    expect(styleRules(css, ".call-grid--screen-share")).toMatch(/grid-template-columns:\s*minmax\(0,\s*5fr\)\s+minmax\(112px,\s*1fr\)/);
    expect(styleRules(css, ".call-grid--screen-share > .call-grid__tile--screen")).toMatch(/grid-column:\s*1/);
    expect(styleRules(css, ".call-grid__participant-rail")).toMatch(/grid-column:\s*2/);
    expect(styleRules(css, ".call-grid__participant-rail")).toMatch(/overflow:\s*hidden/);
    expect(styleRules(css, ".call-grid__participant-rail")).toMatch(/align-self:\s*stretch/);
    expect(styleRules(css, ".call-grid__participant-rail")).toMatch(/align-content:\s*start/);
    expect(styleRules(css, ".call-grid__remote-rail")).toMatch(/overflow-y:\s*auto/);
    expect(css).toMatch(/@media[^{}]*\(max-width:\s*720px\)[\s\S]*?\.call-grid--screen-share\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto/);
    expect(css).toMatch(/\.call-grid--screen-share \.call-grid__remote-rail\s*\{[^}]*overflow-x:\s*auto/);
    expect(styleRules(css, ".call-grid--screen-share > .call-grid__tile--screen")).toMatch(/aspect-ratio:\s*var\(--screen-aspect-ratio,\s*16\s*\/\s*9\)/);
    expect(styleRules(css, ".shared-call-stage .call-grid--screen-share > .call-grid__tile--screen")).toMatch(/max-height:\s*100%/);
    expect(styleRules(css, '.call-popup.call-popup-group-call--sharing.call-popup-fullscreen > .shared-call-stage-layout[data-sharing="true"][data-participants-collapsed="true"]')).toMatch(/position:\s*absolute/);
    expect(styleRules(css, '.shared-call-stage-layout[data-sharing="true"][data-participants-collapsed="true"] .call-grid--screen-share > .call-grid__tile--screen')).toMatch(/width:\s*min\(100%,\s*calc\(100dvh\s*\*\s*var\(--screen-aspect-ratio/);
    expect(css).toMatch(/\.call-grid--screen-share \.call-grid__participant-pin,\s*\.call-grid--screen-share \.call-grid__remote-rail > \[data-participant-id\]\s*\{[^}]*flex:\s*0 0 auto;[^}]*height:\s*100% !important;[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  });

  it("preserves a real 4:3 screen source ratio in the mobile presentation row", () => {
    const screenTrack = { readyState: "live", kind: "video", getSettings: () => ({ width: 1440, height: 1080 }), addEventListener() {}, removeEventListener() {} };
    const screenStream = { getVideoTracks: () => [screenTrack] } as unknown as MediaStream;
    const container = renderGrid({
      localStream: null,
      localScreenStream: screenStream,
      localUserLabel: "You",
      callType: "video",
      isMobileLayout: true,
      remoteMedia: [],
    });

    const presenter = container.querySelector<HTMLElement>(".call-grid--mobile-presentation > .call-grid__tile--screen");
    expect(presenter).not.toBeNull();
    expect(Number.parseFloat(presenter?.style.aspectRatio ?? "0")).toBeCloseTo(4 / 3);
    const css = readCssSource("src/styles.css");
    expect(styleRules(css, ".mobile-active-video-stage .call-grid--mobile-presentation > .call-grid__tile--screen")).toMatch(/aspect-ratio:\s*var\(--screen-aspect-ratio/);
    expect(styleRules(css, ".shared-call-stage-layout[data-sharing=\"true\"][data-participants-collapsed=\"true\"] .call-grid--screen-share > .call-grid__tile--screen")).toMatch(/aspect-ratio:\s*var\(--screen-aspect-ratio/);
    expect(styleRules(css, ".mobile-active-video-stage .call-grid--mobile-presentation")).toMatch(/grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)/);
    expect(styleRules(css, ".mobile-active-video-stage .call-grid--mobile-presentation > .call-grid__mobile-participant-row")).toMatch(/grid-row:\s*1/);
    expect(styleRules(css, ".mobile-active-video-stage .call-grid--mobile-presentation > .call-grid__tile--screen")).toMatch(/grid-row:\s*2/);
  });

  it("chooses the screen-share rail from measured stage width and height and updates on resize", () => {
    let stage = { width: 1200, height: 720 };
    const observers: Array<(size: { width: number; height: number }) => void> = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        observers.push((size) => {
          const rect = { x: 0, y: 0, top: 0, left: 0, width: size.width, height: size.height, right: size.width, bottom: size.height, toJSON: () => ({}) } as DOMRectReadOnly;
          const entry = { target, contentRect: rect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] } as unknown as ResizeObserverEntry;
          this.callback([entry], this as unknown as ResizeObserver);
        });
        observers.at(-1)?.(stage);
      }
      disconnect() {}
    });
    const screen = { getVideoTracks: () => [{ readyState: "live" }] } as unknown as MediaStream;
    const container = renderGrid({
      localStream: null,
      localScreenStream: screen,
      remoteMedia: [{ userId: "peer", stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false }],
      callType: "video",
    });
    const grid = container.querySelector<HTMLElement>(".call-grid")!;
    expect(observers).toHaveLength(1);
    expect(grid.classList.contains("call-grid--screen-share-bottom")).toBe(false);

    stage = { width: 1200, height: 400 };
    act(() => observers.forEach((resize) => resize(stage)));
    expect(grid.classList.contains("call-grid--screen-share-bottom")).toBe(false);

    stage = { width: 450, height: 720 };
    act(() => observers.forEach((resize) => resize(stage)));
    expect(grid.classList.contains("call-grid--screen-share-bottom")).toBe(true);
    const presenter = grid.querySelector<HTMLElement>(".call-grid__tile--screen")!;
    const presenterWidth = Number.parseFloat(presenter.style.width);
    const presenterHeight = Number.parseFloat(presenter.style.height);
    expect(presenterWidth).toBeLessThanOrEqual(stage.width);
    expect(presenterHeight).toBeLessThanOrEqual(stage.height);
    expect(presenterWidth / presenterHeight).toBeCloseTo(16 / 9);

    stage = { width: 1200, height: 150 };
    act(() => observers.forEach((resize) => resize(stage)));
    expect(grid.classList.contains("call-grid--screen-share-bottom")).toBe(true);

    stage = { width: 1200, height: 720 };
    act(() => observers.forEach((resize) => resize(stage)));
    expect(grid.classList.contains("call-grid--screen-share-bottom")).toBe(false);
  });

  it("renders a synthetic 16:9 screen share and moves participants below it when the stage is constrained", () => {
    let stage = { width: 1200, height: 720 };
    const observers: Array<(size: { width: number; height: number }) => void> = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        observers.push((size) => {
          const rect = { x: 0, y: 0, top: 0, left: 0, width: size.width, height: size.height, right: size.width, bottom: size.height, toJSON: () => ({}) } as DOMRectReadOnly;
          const entry = { target, contentRect: rect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] } as unknown as ResizeObserverEntry;
          this.callback([entry], this as unknown as ResizeObserver);
        });
        observers.at(-1)?.(stage);
      }
      disconnect() {}
    });
    const container = renderGrid({
      localStream: null,
      localUserLabel: "Stovo Demo",
      remoteMedia: [
        { userId: "user-alex-rivera", stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false },
      ],
      callType: "audio",
      mockScreenShareOwner: { userId: "user-stovo-demo", displayName: "Stovo Demo" },
    });

    const grid = container.querySelector<HTMLElement>(".call-grid")!;
    const preview = grid.querySelector<HTMLElement>('[role="img"][aria-label="Stovo Demo\'s shared screen"]');
    const presenter = grid.querySelector<HTMLElement>(".call-grid__tile--screen");
    expect(preview).not.toBeNull();
    expect(presenter?.style.aspectRatio).toBe("16 / 9");
    expect(grid.classList.contains("call-grid--screen-share")).toBe(true);
    expect(grid.classList.contains("call-grid--screen-share-bottom")).toBe(false);
    expect(grid.querySelector(".call-grid__participant-rail")).not.toBeNull();
    expect(styleRules(readCssSource("src/styles.css"), ".call-grid__participant-rail")).toMatch(/grid-column:\s*2/);

    stage = { width: 1200, height: 400 };
    act(() => observers.forEach((resize) => resize(stage)));
    expect(grid.classList.contains("call-grid--screen-share-bottom")).toBe(false);

    stage = { width: 450, height: 720 };
    act(() => observers.forEach((resize) => resize(stage)));
    expect(grid.classList.contains("call-grid--screen-share-bottom")).toBe(true);
    expect(grid.querySelector('[role="img"][aria-label="Stovo Demo\'s shared screen"]')).not.toBeNull();
    expect(presenter?.style.aspectRatio).toBe("16 / 9");
  });

  it("keeps speech on the participant and preserves the screen tile's 16:9 ratio", () => {
    const screen = { getVideoTracks: () => [{ readyState: "live" }] } as unknown as MediaStream;
    const container = renderGrid({ localStream: null, localScreenStream: screen, remoteMedia: [], callType: "audio", isLocalSpeaking: true });
    const tile = container.querySelector<HTMLElement>(".call-grid__tile--screen")!;
    expect(tile.classList.contains("is-speaking")).toBe(false);
    expect(tile.querySelector('[role="status"]')).toBeNull();
    expect(tile.style.aspectRatio).toBe("16 / 9");
    expect(tile.style.maxHeight).toBe("100%");
    expect(container.querySelector('.call-grid__tile--local.is-speaking')).not.toBeNull();
  });

  it("uses the full shared stage and moves crowded screen-share participants to a compact top row", () => {
    const screenTrack = { readyState: "live", kind: "video", getSettings: () => ({ width: 1920, height: 1080 }), addEventListener() {}, removeEventListener() {} };
    const screenStream = { getVideoTracks: () => [screenTrack] } as unknown as MediaStream;
    const remoteMedia = ["one", "two", "three", "four"].map((userId) => ({
      userId, stream: emptyStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false,
    }));
    const container = renderGrid({ localStream: null, localScreenStream: screenStream, remoteMedia, callType: "video" });
    const grid = container.querySelector<HTMLElement>(".call-grid");
    expect(grid?.classList.contains("call-grid--screen-share-bottom")).toBe(true);
    expect(grid?.style.alignContent).toBe("start");
    expect(grid?.querySelector(".call-grid__participant-rail")).not.toBeNull();

    const css = readCssSource("src/styles.css");
    expect(css).toMatch(/\.shared-call-stage \.call-grid--presenting\.call-grid--screen-share\s*\{[^}]*height:\s*100%\s*!important;[^}]*aspect-ratio:\s*auto/);
    expect(css).toMatch(/\.call-grid--screen-share-bottom \.call-grid__tile--screen\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
    expect(css).toMatch(/\.call-grid--screen-share-bottom \.call-grid__participant-rail\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1/);
    expect(css).toMatch(/@media\s*\(max-width:\s*720px\)[\s\S]*?\.call-grid--screen-share-bottom\s*\{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*720px\)[\s\S]*?\.call-grid--screen-share-bottom > \.call-grid__tile--screen\s*\{[^}]*grid-row:\s*2/);
    expect(css).toMatch(/@media\s*\(max-width:\s*720px\)[\s\S]*?\.call-grid--screen-share-bottom \.call-grid__participant-rail\s*\{[^}]*grid-row:\s*1/);
    expect(css).toMatch(/\.call-grid--screen-share\s*\{[^}]*minmax\(0,\s*5fr\)\s+minmax\(112px,\s*1fr\)/);
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
    const css = readCssSource("src/styles.css");
    expect(styleRules(css, ".call-grid__tile.is-speaking")).toMatch(/outline:\s*1px\s+solid\s+var\(--color-palette-8b8f7c3d4541\)/);
    expect(styleRules(css, ".call-grid__tile.is-speaking .call-grid__avatar-circle")).toContain("box-shadow: 0 0 0 2px var(--color-palette-449c31647178)");
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
