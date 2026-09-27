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
  vi.unstubAllGlobals();
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

  it("shows the remote video full-screen and the local camera as a PiP with flip control", () => {
    const track = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        callType="video"
        isCameraEnabled
        hasRemoteVideo
        localVideoStream={stream}
        remoteVideoStream={stream}
      />,
    );

    expect(container.querySelector(".mobile-active-fullscreen-video")).not.toBeNull();
    expect(container.querySelector(".mobile-active-pip video")).not.toBeNull();
    expect(container.querySelector(".mobile-active-pip [aria-label='Flip camera']")).not.toBeNull();
  });

  it("swaps the local camera to full-screen and the remote video into PiP when the local PiP is tapped", () => {
    const track = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const localStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const remoteStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        callType="video"
        isCameraEnabled
        hasRemoteVideo
        localVideoStream={localStream}
        remoteVideoStream={remoteStream}
      />,
    );

    const localPip = container.querySelector(".mobile-active-pip") as HTMLDivElement;
    act(() => localPip.click());

    const fullscreen = container.querySelector(".mobile-active-fullscreen-video");
    const pip = container.querySelector(".mobile-active-pip video");
    expect(fullscreen).not.toBeNull();
    expect(pip).not.toBeNull();
    expect((fullscreen as HTMLVideoElement).srcObject).toBe(localStream);
    expect((pip as HTMLVideoElement).srcObject).toBe(remoteStream);
    expect(container.querySelector(".mobile-active-pip [aria-label='Flip camera']")).toBeNull();
  });

  it.each([
    { localSpeaking: true, peerSpeaking: false },
    { localSpeaking: false, peerSpeaking: true },
  ])("keeps speaking badges with their streams after swapping self-view (local=$localSpeaking, peer=$peerSpeaking)", ({ localSpeaking, peerSpeaking }) => {
    const track = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const localStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const remoteStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        callType="video"
        isCameraEnabled
        hasRemoteVideo
        isLocalSpeaking={localSpeaking}
        isPeerSpeaking={peerSpeaking}
        localVideoStream={localStream}
        remoteVideoStream={remoteStream}
      />,
    );

    act(() => (container.querySelector(".mobile-active-pip") as HTMLDivElement).click());

    const pip = container.querySelector(".mobile-active-pip") as HTMLDivElement;
    const fullscreenLocal = container.querySelector(".mobile-active-remote-video-wrap");
    expect((pip.querySelector("video") as HTMLVideoElement).srcObject).toBe(remoteStream);
    expect(pip.querySelector(".speaking-wave-badge") !== null).toBe(peerSpeaking);
    expect(fullscreenLocal?.querySelector("video")?.getAttribute("class")).toContain("mobile-active-fullscreen-video");
    expect(fullscreenLocal?.querySelector(".speaking-wave-badge") !== null).toBe(localSpeaking);
  });

  it("keeps camera flip available and invokes it when self-view is full-screen", async () => {
    const track = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const localStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const remoteStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const onToggleFlip = vi.fn();
    const raf = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        callType="video"
        isCameraEnabled
        hasRemoteVideo
        localVideoStream={localStream}
        remoteVideoStream={remoteStream}
        onToggleFlip={onToggleFlip}
      />,
    );

    act(() => (container.querySelector(".mobile-active-pip") as HTMLDivElement).click());
    const flip = container.querySelector("button[aria-label='Flip camera']") as HTMLButtonElement | null;
    expect(flip).not.toBeNull();
    await act(async () => { flip?.click(); await Promise.resolve(); });
    expect(onToggleFlip).toHaveBeenCalledOnce();
  });

  it.each(["Enter", " "])("allows swapping self-view from the keyboard when the PiP has focus using %s", (key) => {
    const track = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const localStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const remoteStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        callType="video"
        isCameraEnabled
        hasRemoteVideo
        localVideoStream={localStream}
        remoteVideoStream={remoteStream}
      />,
    );
    const pip = container.querySelector(".mobile-active-pip") as HTMLDivElement;

    expect(pip.tabIndex).toBe(0);
    act(() => pip.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));

    const fullscreen = container.querySelector(".mobile-active-remote-video-wrap video") as HTMLVideoElement;
    expect(fullscreen.srcObject).toBe(localStream);
  });

  it.each(["Enter", " "])("activates Flip without swapping self-view when %s is pressed on the nested PiP button", async (key) => {
    const track = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const localStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const remoteStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const onToggleFlip = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        callType="video"
        isCameraEnabled
        hasRemoteVideo
        localVideoStream={localStream}
        remoteVideoStream={remoteStream}
        onToggleFlip={onToggleFlip}
      />,
    );
    const flip = container.querySelector(".mobile-active-pip button[aria-label='Flip camera']") as HTMLButtonElement;
    const expectOriginalAssignments = () => {
      const remoteFullscreen = container.querySelector(".mobile-active-fullscreen-video") as HTMLVideoElement;
      const localPip = container.querySelector(".mobile-active-pip video") as HTMLVideoElement;
      expect(remoteFullscreen?.srcObject).toBe(remoteStream);
      expect(localPip?.srcObject).toBe(localStream);
    };

    await act(async () => {
      flip.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
    expectOriginalAssignments();
    if (key === " ") {
      act(() => flip.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true })));
      expectOriginalAssignments();
    }
    await act(async () => {
      // JSDOM does not synthesize a button click from keyboard activation.
      flip.click();
      await Promise.resolve();
    });

    expect(onToggleFlip).toHaveBeenCalledOnce();
    expectOriginalAssignments();
  });

  it.each(["Enter", " "])("does not move the local-camera PiP when %s activates nested Flip during local screen share", async (key) => {
    const track = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const localStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const onToggleFlip = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
    const container = renderComponent(
      <MobileActiveScreen
        {...defaultProps}
        callType="video"
        isCameraEnabled
        isScreenSharing
        hasRemoteVideo={false}
        localVideoStream={localStream}
        localScreenStream={null}
        onToggleFlip={onToggleFlip}
      />,
    );
    const pip = container.querySelector(".mobile-active-pip") as HTMLDivElement;
    const flip = pip.querySelector("button[aria-label='Flip camera']") as HTMLButtonElement;
    const initialSide = pip.classList.contains("mobile-active-pip--right") ? "right" : "left";
    const expectOriginalPip = () => {
      const currentPip = container.querySelector(".mobile-active-pip") as HTMLDivElement;
      expect(currentPip.classList.contains(`mobile-active-pip--${initialSide}`)).toBe(true);
      expect((currentPip.querySelector("video") as HTMLVideoElement)?.srcObject).toBe(localStream);
      expect(container.querySelector(".mobile-active-fullscreen-video")).not.toBeNull();
    };

    await act(async () => {
      flip.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
    expectOriginalPip();
    if (key === " ") {
      act(() => flip.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true })));
      expectOriginalPip();
    }
    await act(async () => {
      // JSDOM does not synthesize a button click from keyboard activation.
      flip.click();
      await Promise.resolve();
    });

    const updatedPip = container.querySelector(".mobile-active-pip") as HTMLDivElement;
    expect(onToggleFlip).toHaveBeenCalledOnce();
    expect(updatedPip).not.toBeNull();
    expectOriginalPip();
  });

  it("orders the first mobile control row as microphone, audio output, and camera", () => {
    const container = renderComponent(<MobileActiveScreen {...defaultProps} callType="video" isCameraEnabled />);
    const labels = Array.from(container.querySelectorAll(".mobile-active-controls > .mobile-active-ctrl button"))
      .map((button) => button.getAttribute("aria-label"));

    expect(labels.slice(0, 3)).toEqual(["Mute", "Audio output", "Turn off camera"]);
  });

  it("auto-hides controls after the delay and reveals them when the stage is tapped", () => {
    vi.useFakeTimers();
    try {
      const container = renderComponent(<MobileActiveScreen {...defaultProps} />);
      const controls = container.querySelector(".mobile-active-controls") as HTMLDivElement;
      expect(controls.classList.contains("mobile-active-controls--hidden")).toBe(false);

      act(() => vi.advanceTimersByTime(15_000));
      expect(controls.classList.contains("mobile-active-controls--hidden")).toBe(true);

      act(() => container.querySelector(".mobile-active-screen")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
      expect(controls.classList.contains("mobile-active-controls--hidden")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders shrink as a standalone icon button without a menu", () => {
    const onShrink = vi.fn();
    const container = renderComponent(<MobileActiveScreen {...defaultProps} onShrink={onShrink} />);
    const button = container.querySelector("button[aria-label='Shrink call']") as HTMLButtonElement;

    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.querySelector("[role='menu']")).toBeNull();
    act(() => button.click());
    expect(onShrink).toHaveBeenCalledOnce();
  });
});
