import { describe, it, expect, vi, afterEach } from "vitest";
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot, Root } from "react-dom/client";
import { MobileActiveScreen } from "./MobileActiveScreen";

const mountedRoots: Root[] = [];

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => {
      root?.unmount();
    });
  }
  document.body.innerHTML = "";
});

function renderComponent(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(ui);
  });
  return container;
}

function styleRules(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")), (match) => match[1]).join("\n");
}

describe("MobileActiveScreen", () => {
  const defaultProps = {
    peerName: "Alice",
    peerProfilePhoto: null,
    accessToken: "test-token",
    callType: "audio" as const,
    callPhase: "in-call",
    isPeerSpeaking: false,
    isProximityNear: false,
    isMicMuted: false,
    isCameraEnabled: false,
    isScreenSharing: false,
    cameraFacingMode: "user" as const,
    speakerMode: "large" as const,
    timer: "00:45",
    hasRemoteVideo: false,
    localVideoStream: null,
    remoteVideoStream: null,
    mirrorLocalVideo: false,
    onToggleMic: vi.fn(),
    onToggleCamera: vi.fn(),
    onToggleScreenShare: vi.fn(),
    onToggleFlip: vi.fn(),
    onOpenSpeakerSheet: vi.fn(),
    onEnd: vi.fn(),
  };

  it("routes screen sharing through the More menu instead of a direct mobile control", () => {
    const container = renderComponent(
      <MobileActiveScreen {...defaultProps} />
    );

    expect(container.querySelector(".mobile-active-controls button[aria-label='Share screen']")).toBeNull();
    const moreBtn = container.querySelector("button[aria-label='More options']") as HTMLButtonElement;
    expect(moreBtn).not.toBeNull();

    act(() => {
      moreBtn.click();
    });
    const shareBtn = container.querySelector("[role='group'] button[aria-label='Share screen']") as HTMLButtonElement;
    expect(shareBtn).not.toBeNull();
    act(() => shareBtn.click());
    expect(defaultProps.onToggleScreenShare).toHaveBeenCalled();
  });

  it.each([320, 360])("keeps real mobile controls fixed, circular, evenly spaced and in one row at %ipx", (width) => {
    const container = renderComponent(<MobileActiveScreen {...defaultProps} />);
    container.style.width = `${width}px`;
    const controls = container.querySelector<HTMLElement>(".mobile-active-controls");
    expect(controls?.dataset.layout).toBe("mobile-one-row");
    expect(controls?.dataset.noWrap).toBe("true");
    expect(controls?.querySelectorAll("button")).toHaveLength(5);

    const css = readFileSync("src/styles.css", "utf8");
    const controlsRule = styleRules(css, ".mobile-active-controls");
    const buttonRule = styleRules(css, ".mobile-active-ctrl-btn");
    expect(controlsRule).toMatch(/grid-template-columns:\s*repeat\(5,/);
    expect(controlsRule).toMatch(/width:\s*100%/);
    expect(controlsRule).toMatch(/column-gap:\s*clamp\(/);
    expect(controlsRule).toMatch(/row-gap:\s*0/);
    expect(controlsRule).toMatch(/flex-wrap:\s*nowrap/);
    expect(buttonRule).toMatch(/width:\s*40px/);
    expect(buttonRule).toMatch(/height:\s*40px/);
    expect(buttonRule).toMatch(/border-radius:\s*50%/);
  });

  it("keeps screen sharing in the standard More toggle without a separate Stop banner button", () => {
    const onToggleScreenShare = vi.fn();
    const container = renderComponent(
      <MobileActiveScreen {...defaultProps} isScreenSharing={true} onToggleScreenShare={onToggleScreenShare} />
    );

    expect(container.querySelector("button[aria-label='Stop screen share']")).toBeNull();
    const moreBtn = container.querySelector("button[aria-label='More options']") as HTMLButtonElement;
    act(() => moreBtn.click());
    const shareBtn = container.querySelector("[role='group'] button[aria-label='Stop sharing']") as HTMLButtonElement;
    expect(shareBtn).not.toBeNull();
    expect(shareBtn.textContent).toContain("Stop sharing");
    act(() => shareBtn.click());
    expect(onToggleScreenShare).toHaveBeenCalledTimes(1);
    expect(container.querySelector("button[aria-label='Stop sharing']")).toBeNull();
  });

  it("shows a compact SVG Back beside Shrink during participant focus and restores the grid", () => {
    const track = { readyState: "live", kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const remoteMedia = ["Alice", "Bob"].map((userId) => ({
      userId,
      stream,
      screenStream: null,
      hasVideo: true,
      hasAudio: true,
      hasScreenShare: false,
    }));
    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        callType="video"
        hasRemoteVideo
        remoteVideoStream={stream}
        remoteMedia={remoteMedia}
      />,
    );
    act(() => container.querySelector<HTMLElement>(".call-grid__tile--remote .call-grid__label")?.click());
    expect(container.querySelector(".call-grid--focus")).not.toBeNull();

    const topBar = container.querySelector<HTMLElement>(".mobile-active-top-bar");
    const actions = Array.from(topBar?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    expect(actions.map((button) => button.getAttribute("aria-label"))).toEqual(["Close participant focus", "Shrink call"]);
    expect(actions[0].querySelector("svg")).not.toBeNull();
    expect(actions[0].textContent?.trim()).toBe("");
    act(() => actions[0].click());
    expect(container.querySelector(".call-grid--focus")).toBeNull();
    expect(Array.from(topBar?.querySelectorAll<HTMLButtonElement>("button") ?? []).map((button) => button.getAttribute("aria-label"))).toEqual(["Shrink call"]);
    expect(container.querySelectorAll(".call-grid__tile").length).toBeGreaterThan(1);
  });

  it("renders video stage when localScreenStream is present", () => {
    const mockTrack = {
      readyState: "live",
      kind: "video",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const mockScreenStream = {
      getVideoTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        isScreenSharing={true}
        localScreenStream={mockScreenStream}
      />
    );

    const videoStage = container.querySelector(".mobile-active-video-stage");
    expect(videoStage).not.toBeNull();
    expect(container.querySelector(".mobile-active-screenshare-bar")).not.toBeNull();
  });

  it("uses a vertical presentation tile for a portrait screen share", () => {
    const mockTrack = {
      readyState: "live",
      kind: "video",
      getSettings: () => ({ width: 1080, height: 1920 }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const mockScreenStream = {
      getVideoTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        isScreenSharing
        localScreenStream={mockScreenStream}
      />
    );

    const presentationTile = container.querySelector(".call-grid__tile--screen") as HTMLDivElement;
    expect(presentationTile.style.aspectRatio).toBe("9 / 16");
  });

  it("keeps every camera tile below an active remote screen share", () => {
    const mockTrack = {
      readyState: "live",
      kind: "video",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const mockStream = {
      getVideoTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        callType="video"
        isCameraEnabled
        localVideoStream={mockStream}
        remoteMedia={[{
          userId: "alice",
          stream: mockStream,
          screenStream: mockStream,
          hasVideo: true,
          hasAudio: true,
          hasScreenShare: true,
        }]}
      />
    );

    expect(container.querySelector(".call-grid--presenting")).not.toBeNull();
    expect(container.querySelectorAll(".call-grid__tile")).toHaveLength(3);
  });

  it("renders active audio rings around avatar when peer is speaking in audio call", () => {
    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        isPeerSpeaking={true}
      />
    );

    const rings = container.querySelectorAll(".mobile-active-audio-ring:not(.silent)");
    expect(rings.length).toBeGreaterThan(0);
    const avatar = container.querySelector(".mobile-active-avatar");
    expect(avatar).not.toBeNull();
  });

  it("renders wave animation badge in top-right corner of remote video when peer is speaking", () => {
    const mockTrack = {
      readyState: "live",
      kind: "video",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const mockRemoteStream = {
      getVideoTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        hasRemoteVideo={true}
        remoteVideoStream={mockRemoteStream}
        isPeerSpeaking={true}
      />
    );

    const waveBadge = container.querySelector(".speaking-wave-badge");
    expect(waveBadge).not.toBeNull();
    const bars = container.querySelectorAll(".speaking-wave-bar");
    expect(bars.length).toBe(4);
  });
});
