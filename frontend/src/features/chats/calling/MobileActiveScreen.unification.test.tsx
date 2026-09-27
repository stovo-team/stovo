import { act } from "react";
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
    const flipButton = localTile?.querySelector<HTMLButtonElement>('[aria-label="Flip camera"]');

    expect(grid).not.toBeNull();
    expect(localTile).not.toBeNull();
    expect(remoteTile).not.toBeNull();
    expect(flipButton).not.toBeNull();
    expect(flipButton?.closest(".call-grid__tile--local")).not.toBeNull();
    expect(container.querySelector('.mobile-active-controls [aria-label="Flip camera"]')).toBeNull();
  });
  it("routes the core call controls to their actions", () => {
    const onToggleMic = vi.fn();
    const onToggleCamera = vi.fn();
    const onToggleScreenShare = vi.fn();
    const onEnd = vi.fn();
    const container = renderScreen({ ...baseProps, onToggleMic, onToggleCamera, onToggleScreenShare, onEnd });

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Mute"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Turn on camera"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Share screen"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="End call"]')?.click();
    });

    expect(onToggleMic).toHaveBeenCalledOnce();
    expect(onToggleCamera).toHaveBeenCalledOnce();
    expect(onToggleScreenShare).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
