import { readCssSource } from "../../../test/cssSource";
import { describe, it, expect, vi, afterEach } from "vitest";
import React, { act } from "react";
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

    const css = readCssSource("src/styles.css");
    const controlsRule = styleRules(css, ".mobile-active-controls");
    const buttonRule = styleRules(css, ".mobile-active-ctrl-btn");
    expect(controlsRule).toMatch(/grid-template-columns:\s*repeat\(5,/);
    expect(controlsRule).toMatch(/width:\s*100%/);
    expect(controlsRule).toMatch(/column-gap:\s*clamp\(/);
    expect(controlsRule).toMatch(/row-gap:\s*0/);
    expect(controlsRule).toMatch(/flex-wrap:\s*nowrap/);
    expect(buttonRule).toMatch(/width:\s*40px/);
    expect(buttonRule).toMatch(/height:\s*40px/);
    expect(buttonRule).toMatch(/border-radius:\s*var\(--radius-circle\)/);
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

  it("keeps mobile group participants in the centered grid when tapped", () => {
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
    const tile = container.querySelector<HTMLElement>(".call-grid__tile--remote");
    expect(tile).not.toBeNull();
    act(() => tile?.click());
    expect(container.querySelector(".call-grid--focus")).toBeNull();
    expect(container.querySelector(".mobile-active-top-bar [aria-label='Close participant focus']")).toBeNull();
    expect(container.querySelector(".mobile-active-top-bar [aria-label='Shrink call']")).not.toBeNull();
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

  it("preserves a portrait screen source ratio and contains its content", () => {
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
    expect(Number.parseFloat(presentationTile.style.aspectRatio)).toBeCloseTo(9 / 16);
    expect(presentationTile.querySelector<HTMLVideoElement>("video")?.style.objectFit).toBe("contain");
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

  it("does not render the top-right audio wave badge over remote video when peer is speaking", () => {
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
        callType="video"
        hasRemoteVideo={true}
        remoteVideoStream={mockRemoteStream}
        isPeerSpeaking={true}
      />
    );

    const remoteVideo = container.querySelector<HTMLVideoElement>(".call-grid__video");
    expect(remoteVideo).not.toBeNull();
    expect(remoteVideo?.srcObject).toBe(mockRemoteStream);
    expect(container.querySelector(".speaking-wave-badge")).toBeNull();
  });
});
