import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileActiveScreen } from "./MobileActiveScreen";

const mountedRoots: Root[] = [];

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => root?.unmount());
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function renderScreen(props: React.ComponentProps<typeof MobileActiveScreen>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => root.render(<MobileActiveScreen {...props} />));
  return container;
}

const baseProps: React.ComponentProps<typeof MobileActiveScreen> = {
  peerName: "Alex",
  callType: "audio",
  callPhase: "in-call",
  isPeerSpeaking: false,
  isProximityNear: false,
  isMicMuted: false,
  isCameraEnabled: false,
  isScreenSharing: false,
  cameraFacingMode: "user",
  speakerMode: "large",
  timer: "00:12",
  hasRemoteVideo: false,
  localVideoStream: null,
  remoteVideoStream: null,
  mirrorLocalVideo: true,
  onToggleMic: vi.fn(),
  onToggleCamera: vi.fn(),
  onToggleScreenShare: vi.fn(),
  onToggleFlip: vi.fn(),
  onOpenSpeakerSheet: vi.fn(),
  onEnd: vi.fn(),
};

describe("mobile call UI unification", () => {
  it("shows the shared Speaking status for an active remote speaker", () => {
    const container = renderScreen({ ...baseProps, isPeerSpeaking: true });

    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.textContent).toContain("Speaking");
  });

  it("does not report a remote speaker while the call is connecting", () => {
    const container = renderScreen({ ...baseProps, callPhase: "connecting", isPeerSpeaking: true });

    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("keeps mobile audio routing and camera flip actions without desktop device menus", async () => {
    const onOpenSpeakerSheet = vi.fn();
    const onToggleFlip = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const track = {
      readyState: "live",
      kind: "video",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    const container = renderScreen({
      ...baseProps,
      callType: "video",
      isCameraEnabled: true,
      hasRemoteVideo: true,
      localVideoStream: stream,
      remoteVideoStream: stream,
      onOpenSpeakerSheet,
      onToggleFlip,
    });

    const outputButton = container.querySelector<HTMLButtonElement>('[aria-label="Audio output"]');
    const flipButton = container.querySelector<HTMLButtonElement>('[aria-label="Flip camera"]');
    expect(outputButton).not.toBeNull();
    expect(flipButton).not.toBeNull();
    expect(container.querySelector("select, [role=listbox], .guest-device-select, .call-audio-device-row")).toBeNull();

    act(() => outputButton?.click());
    expect(onOpenSpeakerSheet).toHaveBeenCalledOnce();
    await act(async () => {
      flipButton?.click();
      await Promise.resolve();
    });
    expect(onToggleFlip).toHaveBeenCalledOnce();
  });

  it("keeps the shared flip-camera control attached to the compact local preview", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const track = {
      readyState: "live",
      kind: "video",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    const container = renderScreen({
      ...baseProps,
      callType: "video",
      isCameraEnabled: true,
      hasRemoteVideo: true,
      localVideoStream: stream,
      remoteVideoStream: stream,
    });

    const grid = container.querySelector(".call-grid");
    const localTile = container.querySelector(".call-grid__tile--local");
    const remoteTile = container.querySelector(".call-grid__tile--remote");
    const flipButton = container.querySelector<HTMLButtonElement>('[aria-label="Flip camera"]');

    expect(grid).not.toBeNull();
    expect(localTile).not.toBeNull();
    expect(remoteTile).not.toBeNull();
    expect(flipButton).not.toBeNull();
    expect(localTile?.getAttribute("role")).toBe("button");
    expect(localTile?.tabIndex).toBe(0);
    expect(flipButton?.closest('[role="button"]')).not.toBe(localTile);
    expect(flipButton?.closest(".call-grid__mobile-local-wrap")).not.toBeNull();
    expect(container.querySelector('.mobile-active-controls [aria-label="Flip camera"]')).toBeNull();
  });
  it("routes the core call controls to their actions", () => {
    const onToggleMic = vi.fn();
    const onToggleCamera = vi.fn();
    const onToggleScreenShare = vi.fn();
    const onEnd = vi.fn();
    const container = renderScreen({ ...baseProps, onToggleMic, onToggleCamera, onToggleScreenShare, onEnd });

    expect(container.querySelector('.mobile-active-controls [aria-label="Share screen"]')).toBeNull();

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Mute"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Turn on camera"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="End call"]')?.click();
    });
    act(() => container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('[role="group"] button[aria-label="Share screen"]')?.click());

    expect(onToggleMic).toHaveBeenCalledOnce();
    expect(onToggleCamera).toHaveBeenCalledOnce();
    expect(onToggleScreenShare).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("opens Settings, Share screen and Stovo Intelligence from the lower More menu and closes on Escape", () => {
    const container = renderScreen(baseProps);
    const more = container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]');
    expect(more).not.toBeNull();
    act(() => more?.click());

    const menu = container.querySelector('[role="group"][aria-label="More call options"]');
    expect(menu).not.toBeNull();
    for (const label of ["Settings", "Share screen", "Stovo Intelligence"]) {
      const action = menu?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(action).not.toBeNull();
      expect(action?.getAttribute("role")).toBeNull();
      expect(action?.tabIndex).toBe(0);
    }

    const settings = menu?.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
    act(() => settings?.focus());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("closes the lower More menu when the user clicks outside it", () => {
    const container = renderScreen(baseProps);
    const more = container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]');
    expect(more).not.toBeNull();
    act(() => more?.click());
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).not.toBeNull();

    act(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).toBeNull();
  });

  it("keeps minimize as a standalone SVG button in the top bar", () => {
    const onShrink = vi.fn();
    const container = renderScreen({ ...baseProps, onShrink });
    const minimize = container.querySelector<HTMLButtonElement>('.mobile-active-top-bar button[aria-label="Shrink call"]');
    expect(minimize).not.toBeNull();
    expect(minimize?.querySelector("svg")).not.toBeNull();
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).toBeNull();
    act(() => minimize?.click());
    expect(onShrink).toHaveBeenCalledOnce();
  });

  it("routes Settings from More to the existing settings UI callback", () => {
    const onOpenSettings = vi.fn();
    const container = renderScreen({ ...baseProps, onOpenSettings });
    act(() => container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('[role="group"] button[aria-label="Settings"]')?.click());

    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).toBeNull();
  });

  it("routes Share screen from More to the screen-share callback", () => {
    const onToggleScreenShare = vi.fn();
    const container = renderScreen({ ...baseProps, onToggleScreenShare });
    expect(container.querySelector('.mobile-active-controls [aria-label="Share screen"]')).toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('[role="group"] button[aria-label="Share screen"]')?.click());

    expect(onToggleScreenShare).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).toBeNull();
  });

  it("opens the Meeting Intelligence popover from More", () => {
    const container = renderScreen(baseProps);
    act(() => container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('[role="group"] button[aria-label="Stovo Intelligence"]')?.click());

    expect(container.querySelector('[role="dialog"][aria-label="Meeting Intelligence Controls"]')).not.toBeNull();
  });

  it("keeps the remote full-screen and local PiP swapped on one-to-one video calls", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const localTrack = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const remoteTrack = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const localStream = { getVideoTracks: () => [localTrack], getTracks: () => [localTrack] } as unknown as MediaStream;
    const remoteStream = { getVideoTracks: () => [remoteTrack], getTracks: () => [remoteTrack] } as unknown as MediaStream;
    const onToggleFlip = vi.fn();
    const ControlledFlipCall = () => {
      const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
      const toggleFlip = () => {
        onToggleFlip();
        setCameraFacingMode((mode) => mode === "user" ? "environment" : "user");
      };
      return <MobileActiveScreen
        {...baseProps}
        callType="video"
        isCameraEnabled
        hasRemoteVideo
        localVideoStream={localStream}
        remoteVideoStream={remoteStream}
        cameraFacingMode={cameraFacingMode}
        onToggleFlip={toggleFlip}
      />;
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    mountedRoots.push(root);
    act(() => root.render(<ControlledFlipCall />));
    const container = host;

    const remoteMain = container.querySelector<HTMLVideoElement>(".mobile-active-fullscreen-video");
    const localPip = container.querySelector<HTMLVideoElement>(".mobile-active-pip video");
    const flip = container.querySelector<HTMLButtonElement>(".call-grid__mobile-local-wrap [aria-label='Flip camera']");
    expect(remoteMain?.srcObject).toBe(remoteStream);
    expect(localPip?.srcObject).toBe(localStream);
    expect((container.querySelector(".call-grid__tile--local video") as HTMLVideoElement)?.style.transform).toBe("scaleX(-1)");
    expect(flip).not.toBeNull();

    await act(async () => {
      flip?.click();
      await Promise.resolve();
    });
    expect(onToggleFlip).toHaveBeenCalledOnce();
    expect((container.querySelector(".call-grid__tile--local video") as HTMLVideoElement)?.style.transform).toBe("");
    expect(container.querySelector<HTMLVideoElement>(".mobile-active-fullscreen-video")?.srcObject).toBe(remoteStream);
    expect(container.querySelector<HTMLVideoElement>(".mobile-active-pip video")?.srcObject).toBe(localStream);

    act(() => (container.querySelector(".mobile-active-pip") as HTMLDivElement).click());
    const swappedMain = container.querySelector<HTMLVideoElement>(".mobile-active-fullscreen-video");
    const swappedPip = container.querySelector<HTMLVideoElement>(".mobile-active-pip video");
    expect(swappedMain?.srcObject).toBe(localStream);
    expect(swappedPip?.srcObject).toBe(remoteStream);
    const localPrimaryTile = container.querySelector<HTMLElement>(".call-grid__tile--local");
    const flipWhileSelfFullscreen = container.querySelector<HTMLButtonElement>(".call-grid__mobile-local-wrap [aria-label='Flip camera']");
    expect(localPrimaryTile?.classList.contains("call-grid__mobile-primary")).toBe(true);
    expect(localPrimaryTile?.getAttribute("role")).toBe("button");
    expect(flipWhileSelfFullscreen).not.toBeNull();
    expect(flipWhileSelfFullscreen?.closest(".call-grid__tile--local")).toBeNull();
    await act(async () => {
      flipWhileSelfFullscreen?.click();
      await Promise.resolve();
    });
    expect(onToggleFlip).toHaveBeenCalledTimes(2);
    expect((container.querySelector(".call-grid__tile--local video") as HTMLVideoElement)?.style.transform).toBe("scaleX(-1)");
    expect(container.querySelector<HTMLVideoElement>(".mobile-active-fullscreen-video")?.srcObject).toBe(localStream);
  });

  it.each(["Enter", " "])("swaps remote-main and local-PiP using keyboard %s", (key) => {
    const localTrack = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const remoteTrack = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const localStream = { getVideoTracks: () => [localTrack], getTracks: () => [localTrack] } as unknown as MediaStream;
    const remoteStream = { getVideoTracks: () => [remoteTrack], getTracks: () => [remoteTrack] } as unknown as MediaStream;
    const container = renderScreen({
      ...baseProps,
      callType: "video",
      isCameraEnabled: true,
      hasRemoteVideo: true,
      localVideoStream: localStream,
      remoteVideoStream: remoteStream,
    });
    const localTile = container.querySelector(".call-grid__tile--local") as HTMLDivElement;
    const expectOriginalStage = () => {
      expect(container.querySelector(".call-grid__tile--remote")?.classList.contains("call-grid__mobile-primary")).toBe(true);
      expect(container.querySelector(".call-grid__tile--local")?.classList.contains("call-grid__mobile-pip")).toBe(true);
      expect((container.querySelector(".call-grid__tile--remote video") as HTMLVideoElement)?.srcObject).toBe(remoteStream);
      expect((container.querySelector(".call-grid__tile--local video") as HTMLVideoElement)?.srcObject).toBe(localStream);
    };
    const expectSwappedStage = () => {
      expect(container.querySelector(".call-grid__tile--local")?.classList.contains("call-grid__mobile-primary")).toBe(true);
      expect(container.querySelector(".call-grid__tile--remote")?.classList.contains("call-grid__mobile-pip")).toBe(true);
      expect((container.querySelector(".call-grid__tile--local video") as HTMLVideoElement)?.srcObject).toBe(localStream);
      expect((container.querySelector(".call-grid__tile--remote video") as HTMLVideoElement)?.srcObject).toBe(remoteStream);
    };

    expect(localTile.tabIndex).toBe(0);
    expectOriginalStage();
    act(() => localTile.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    if (key === " ") {
      expectOriginalStage();
      act(() => localTile.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true })));
      expectSwappedStage();
    } else {
      expectSwappedStage();
    }
  });

  it("makes hidden mobile controls inert after timeout and restores interaction when the stage is tapped", () => {
    vi.useFakeTimers();
    const container = renderScreen(baseProps);
    const controls = container.querySelector(".mobile-active-controls") as HTMLDivElement;
    expect(controls.getAttribute("aria-hidden")).toBe("false");
    act(() => vi.advanceTimersByTime(15_000));
    expect(controls.getAttribute("aria-hidden")).toBe("true");
    const buttons = Array.from(controls.querySelectorAll<HTMLButtonElement>("button"));
    expect(controls.hasAttribute("inert") || buttons.every((button) => button.tabIndex < 0)).toBe(true);

    const stage = container.querySelector(".mobile-active-screen") as HTMLElement;
    act(() => stage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(controls.getAttribute("aria-hidden")).toBe("false");
    expect(controls.hasAttribute("inert")).toBe(false);
    expect(buttons[0]?.tabIndex).toBe(0);
  });

  it("does not announce Connected or Speaking for a video stream until the call is in progress", () => {
    const track = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const remoteStream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const container = renderScreen({
      ...baseProps,
      callPhase: "connecting",
      callType: "video",
      hasRemoteVideo: true,
      isPeerSpeaking: true,
      remoteVideoStream: remoteStream,
    });

    expect(container.querySelector(".call-grid__tile--remote [role='status']")).toBeNull();
    const activeContainer = renderScreen({
      ...baseProps,
      callPhase: "in-call",
      callType: "video",
      hasRemoteVideo: true,
      isPeerSpeaking: true,
      remoteVideoStream: remoteStream,
    });
    expect(activeContainer.querySelector(".call-grid__tile--remote [role='status']")?.textContent).toContain("Speaking");
  });
});
