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

  it("renders screen share button unconditionally on mobile active screen", () => {
    const container = renderComponent(
      <MobileActiveScreen {...defaultProps} />
    );

    const shareBtn = container.querySelector("button[aria-label='Share screen']") as HTMLButtonElement;
    expect(shareBtn).toBeDefined();
    expect(shareBtn).not.toBeNull();

    act(() => {
      shareBtn.click();
    });
    expect(defaultProps.onToggleScreenShare).toHaveBeenCalled();
  });

  it("renders active state and screen share banner when isScreenSharing is true", () => {
    const container = renderComponent(
      <MobileActiveScreen {...defaultProps} isScreenSharing={true} />
    );

    const shareBtn = container.querySelector("button[aria-label='Stop sharing screen']");
    expect(shareBtn).toBeDefined();
    expect(shareBtn).not.toBeNull();
    expect(shareBtn?.classList.contains("active")).toBe(true);

    const bannerStopBtn = container.querySelector("button[aria-label='Stop screen share']") as HTMLButtonElement;
    expect(bannerStopBtn).toBeDefined();
    expect(bannerStopBtn).not.toBeNull();

    act(() => {
      bannerStopBtn.click();
    });
    expect(defaultProps.onToggleScreenShare).toHaveBeenCalled();
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
