import { readCssSource } from "../../../test/cssSource";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileActiveScreen } from "./MobileActiveScreen";
import { writeCallUIPreferences } from "./callUIPreferences";

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
function styleRules(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")), (match) => match[1]).join("\n");
}

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

  it("exposes mic, speaker, camera, More and End in one mobile control row", () => {
    const container = renderScreen(baseProps);
    const controls = container.querySelector<HTMLElement>(".mobile-active-controls");
    expect(controls?.getAttribute("data-layout")).toBe("mobile-one-row");
    expect(controls?.getAttribute("data-no-wrap")).toBe("true");
    const actionLabels = Array.from(controls?.querySelectorAll<HTMLButtonElement>("button[aria-label]") ?? [])
      .map((button) => button.getAttribute("aria-label"));
    expect(actionLabels).toEqual(["Mute", "Audio output", "Turn on camera", "More options", "End call"]);
    expect(controls?.querySelector('[aria-label="End call"] svg')).not.toBeNull();
    expect(controls?.querySelectorAll(".mobile-active-ctrl-lbl")).toHaveLength(0);
  });

  it("keeps participant collapse and invite actions beside a mobile screen share", () => {
    const openInvite = vi.fn();
    window.addEventListener("stovo:open-call-invite", openInvite);
    try {
      const container = renderScreen({
        ...baseProps,
        callType: "video",
        mockScreenShareOwner: { userId: "presenter", displayName: "Alex" },
      });
      expect(container.querySelector('.shared-call-stage [aria-label="Hide participants"]')).not.toBeNull();
      const invite = container.querySelector<HTMLButtonElement>('.mobile-active-top-bar [aria-label="Invite people"]');
      expect(invite).not.toBeNull();
      act(() => invite?.click());
      expect(openInvite).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("stovo:open-call-invite", openInvite);
    }
  });

  it("uses round icon actions for AI Notes and video recording", () => {
    const container = renderScreen(baseProps);
    act(() => container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Stovo Intelligence"]')?.click());
    for (const label of ["Start AI Notes", "Start Recording"]) {
      const action = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
      expect(action?.querySelector("svg")).not.toBeNull();
      expect(action?.textContent).not.toMatch(/Start/);
    }
  });

  it("keeps mobile call controls round and fixed-size inside the floating panel", () => {
    const styles = readCssSource("src/styles.css");
    expect(styleRules(styles, ".mobile-active-screen .shared-call-control-panel")).toMatch(/width:\s*max-content/);
    expect(styleRules(styles, ".mobile-active-screen .shared-call-control-panel > .mobile-active-controls")).toMatch(/background:\s*transparent/);
    expect(styleRules(styles, ".mobile-active-screen .shared-call-control-panel .mobile-active-ctrl-btn")).toMatch(/flex:\s*0 0/);
    expect(styleRules(styles, ".mobile-active-screen .shared-call-control-panel .mobile-active-ctrl-btn")).toMatch(/border-radius:\s*var\(--radius-circle\)/);
    expect(styleRules(styles, ".meeting-intel-popover--inline-menu .meeting-intel-inline-toggle")).toMatch(/padding:\s*0 12px/);
    expect(styleRules(styles, ".meeting-intel-popover--inline-menu .meeting-intel-inline-toggle")).toMatch(/font:\s*inherit/);
    expect(styleRules(styles, ".meeting-intel-popover--inline-menu .meeting-intel-toggle-btn")).toMatch(/border-radius:\s*var\(--radius-circle\)/);
    expect(styleRules(styles, ".meeting-intel-popover--inline-menu .meeting-intel-name")).toMatch(/font-size:\s*var\(--font-size-small\)/);
  });

  it("keeps the mobile participant toggle anchored to the presentation edge", () => {
    const styles = readCssSource("src/styles.css");
    expect(styleRules(styles, ".shared-call-participants-toggle")).toMatch(/position:\s*absolute/);
    expect(styleRules(styles, ".mobile-active-video-stage .shared-call-participants-toggle")).toMatch(/left:\s*0/);
  });

  it("toggles auto-hidden controls on repeated mobile stage taps", () => {
    writeCallUIPreferences({ autoHideControls: true });
    const container = renderScreen(baseProps);
    const screen = container.querySelector<HTMLElement>(".mobile-active-screen")!;
    const controls = container.querySelector<HTMLElement>(".mobile-active-controls")!;
    expect(controls.getAttribute("aria-hidden")).toBe("false");
    act(() => screen.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(controls.getAttribute("aria-hidden")).toBe("true");
    act(() => screen.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(controls.getAttribute("aria-hidden")).toBe("false");
  });

  it("hides mobile controls after the idle timeout when explicitly enabled", () => {
    vi.useFakeTimers();
    localStorage.clear();
    writeCallUIPreferences({ autoHideControls: true });
    const container = renderScreen(baseProps);
    const controls = container.querySelector<HTMLElement>(".mobile-active-controls")!;
    expect(controls.getAttribute("aria-hidden")).toBe("false");
    act(() => vi.advanceTimersByTime(15_000));
    expect(controls.getAttribute("aria-hidden")).toBe("true");
  });

  it("toggles mobile controls once when tapping inside the shared presentation stage", () => {
    writeCallUIPreferences({ autoHideControls: true });
    const screenTrack = { readyState: "live", kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const screenStream = { getVideoTracks: () => [screenTrack], getTracks: () => [screenTrack] } as unknown as MediaStream;
    const container = renderScreen({ ...baseProps, isScreenSharing: true, localScreenStream: screenStream });
    const controls = container.querySelector<HTMLElement>(".mobile-active-controls")!;
    const stage = container.querySelector<HTMLElement>(".mobile-active-video-stage")!;

    act(() => stage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));

    expect(controls.getAttribute("aria-hidden")).toBe("true");
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
    expect(localTile?.getAttribute("role")).toBeNull();
    expect(localTile?.tabIndex).toBe(-1);
    expect(flipButton?.closest('[role="button"]')).not.toBe(localTile);
    expect(flipButton?.closest(".call-grid__mobile-local-wrap")).not.toBeNull();
    expect(container.querySelector('.mobile-active-controls [aria-label="Flip camera"]')).toBeNull();
  });

  it("renders mobile group participants as centered landscape tiles and does not open focus view on tap", () => {
    const stream = { getVideoTracks: () => [], getTracks: () => [] } as unknown as MediaStream;
    const container = renderScreen({
      ...baseProps,
      isGroupCall: true,
      remoteMedia: [{ userId: "peer-1", stream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false }],
      participantProfiles: { "peer-1": { displayName: "Alex", profilePhoto: null } },
    });
    const tile = container.querySelector<HTMLElement>(".call-grid__tile--remote");
    expect(container.querySelector(".mobile-active-avatar")).toBeNull();
    expect(tile?.classList.contains("call-grid__mobile-pip")).toBe(false);
    expect(tile?.getAttribute("role")).toBeNull();
    expect(container.querySelector(".call-grid__focus-main")).toBeNull();
  });

  it("fits the shared screen at 16:9 above landscape participant cards on mobile", () => {
    const screenTrack = { readyState: "live", enabled: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const screenStream = { getVideoTracks: () => [screenTrack], getTracks: () => [screenTrack] } as unknown as MediaStream;
    const audioStream = { getVideoTracks: () => [], getTracks: () => [] } as unknown as MediaStream;
    const container = renderScreen({
      ...baseProps,
      isGroupCall: true,
      isScreenSharing: true,
      localScreenStream: screenStream,
      remoteMedia: [{ userId: "peer-1", stream: audioStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false }],
    });
    expect(container.querySelector(".call-grid--mobile-presentation")).not.toBeNull();
    expect(container.querySelector(".call-grid__tile--screen")).not.toBeNull();
    expect(container.querySelector(".call-grid__mobile-participant-row .call-grid__tile--remote")).not.toBeNull();
    expect(container.querySelector(".mobile-active-more-anchor")).not.toBeNull();
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

  it("orders screen sharing before Settings and keeps the Intelligence section collapsed until opened", () => {
    const container = renderScreen(baseProps);
    const more = container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]');
    expect(more).not.toBeNull();
    act(() => more?.click());

    const menu = container.querySelector('[role="group"][aria-label="More call options"]');
    expect(menu).not.toBeNull();
    for (const label of ["Share screen", "Settings", "Stovo Intelligence"]) {
      const action = menu?.querySelector<HTMLElement>(`[aria-label="${label}"]`);
      expect(action, `expected mobile More action ${label}`).not.toBeNull();
      expect(action?.getAttribute("role")).toBeNull();
      expect(action?.tabIndex).toBe(0);
    }
    expect(menu?.querySelector('[aria-label="Start AI Notes"]')).toBeNull();
    const intelligence = menu?.querySelector<HTMLButtonElement>('[aria-label="Stovo Intelligence"]');
    act(() => intelligence?.click());
    for (const label of ["Start AI Notes", "Start Recording"]) {
      expect(menu?.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
    expect(menu?.querySelector('[aria-label="Toggle Live Captions"]')).toBeNull();
    expect(menu?.querySelector('[aria-label="Premium feature"]')?.textContent).toBe("Premium");

    const settings = menu?.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
    act(() => settings?.focus());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("expands Stovo Intelligence inside More and runs its actions in place", () => {
    const container = renderScreen(baseProps);
    act(() => container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]')?.click());
    const menu = container.querySelector<HTMLElement>('[role="group"][aria-label="More call options"]');
    expect(menu).not.toBeNull();
    expect(menu?.querySelector('[aria-label="Start AI Notes"]')).toBeNull();
    act(() => menu?.querySelector<HTMLButtonElement>('[aria-label="Stovo Intelligence"]')?.click());
    for (const label of ["Start AI Notes", "Start Recording"]) {
      expect(menu?.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
    expect(container.querySelector('[role="dialog"][aria-label="Meeting Intelligence Controls"]')).toBeNull();
    const captions = menu?.querySelector<HTMLInputElement>('[aria-label="Live Captions unavailable"]');
    expect(captions).not.toBeNull();
    expect(captions?.disabled).toBe(true);
    expect(menu?.querySelector('[aria-label="Toggle Live Captions"]')).toBeNull();
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).not.toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="Meeting Intelligence Controls"]')).toBeNull();
  });

  it.each([
    { localCamera: false, remoteCamera: false },
    { localCamera: true, remoteCamera: false },
    { localCamera: false, remoteCamera: true },
  ])("does not expose the two-person main-view switch unless both cameras are enabled ($localCamera/$remoteCamera)", ({ localCamera, remoteCamera }) => {
    const localTrack = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const remoteTrack = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const localStream = { getVideoTracks: () => [localTrack], getTracks: () => [localTrack] } as unknown as MediaStream;
    const remoteStream = { getVideoTracks: () => [remoteTrack], getTracks: () => [remoteTrack] } as unknown as MediaStream;
    const container = renderScreen({
      ...baseProps,
      callType: "video",
      isCameraEnabled: localCamera,
      hasRemoteVideo: remoteCamera,
      localVideoStream: localCamera ? localStream : null,
      remoteVideoStream: remoteCamera ? remoteStream : null,
    });
    expect(container.querySelector(".call-grid--mobile-single")).toBeNull();
    expect(container.querySelector(".call-grid__mobile-primary, .call-grid__mobile-pip")).toBeNull();
  });

  it("keeps two group participants in a column when both cameras are live", () => {
    const track = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const container = renderScreen({
      ...baseProps, isGroupCall: true, callType: "video", isCameraEnabled: true,
      hasRemoteVideo: true, localVideoStream: stream, remoteVideoStream: stream,
      remoteMedia: [{ userId: "peer", stream, screenStream: null, hasVideo: true, hasAudio: true, hasScreenShare: false }],
    });
    expect(container.querySelector(".call-grid--mobile-pair")).not.toBeNull();
    expect(container.querySelector(".call-grid--mobile-single")).toBeNull();
    expect(container.querySelectorAll(".call-grid__tile video")).toHaveLength(2);
  });

  it("swaps the mobile two-person main view only when both local and remote cameras are enabled", () => {
    const localTrack = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const remoteTrack = { readyState: "live", enabled: true, kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const localStream = { getVideoTracks: () => [localTrack], getTracks: () => [localTrack] } as unknown as MediaStream;
    const remoteStream = { getVideoTracks: () => [remoteTrack], getTracks: () => [remoteTrack] } as unknown as MediaStream;
    const container = renderScreen({ ...baseProps, callType: "video", isCameraEnabled: true, hasRemoteVideo: true, localVideoStream: localStream, remoteVideoStream: remoteStream });
    expect(container.querySelector(".call-grid--mobile-single")).not.toBeNull();
    expect(container.querySelector<HTMLVideoElement>(".call-grid__tile--remote video")?.srcObject).toBe(remoteStream);
    expect(container.querySelector<HTMLVideoElement>(".call-grid__tile--local video")?.srcObject).toBe(localStream);
    act(() => container.querySelector<HTMLElement>(".call-grid__tile--remote")?.click());
    expect(container.querySelector(".call-grid__tile--local")?.classList.contains("call-grid__mobile-primary")).toBe(true);
    expect(container.querySelector(".call-grid__tile--remote")?.classList.contains("call-grid__mobile-pip")).toBe(true);
    expect(container.querySelector<HTMLVideoElement>(".call-grid__tile--local video")?.srcObject).toBe(localStream);
    expect(container.querySelector<HTMLVideoElement>(".call-grid__tile--remote video")?.srcObject).toBe(remoteStream);
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

  it("shows the Meeting Intelligence actions in More without a nested popover", () => {
    const container = renderScreen(baseProps);
    act(() => container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]')?.click());
    const menu = container.querySelector('[role="group"][aria-label="More call options"]');
    act(() => menu?.querySelector<HTMLButtonElement>('[aria-label="Stovo Intelligence"]')?.click());
    expect(menu?.querySelector('[aria-label="Start AI Notes"]')).not.toBeNull();
    expect(menu?.querySelector('[aria-label="Start Recording"]')).not.toBeNull();
    const captions = menu?.querySelector<HTMLInputElement>('[aria-label="Live Captions unavailable"]');
    expect(captions).not.toBeNull();
    expect(captions?.disabled).toBe(true);
    expect(menu?.querySelector('[aria-label="Toggle Live Captions"]')).toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="Meeting Intelligence Controls"]')).toBeNull();
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

    act(() => (container.querySelector(".call-grid__tile--remote") as HTMLDivElement).click());
    const swappedMain = container.querySelector<HTMLVideoElement>(".mobile-active-fullscreen-video");
    const swappedPip = container.querySelector<HTMLVideoElement>(".mobile-active-pip video");
    expect(swappedMain?.srcObject).toBe(localStream);
    expect(swappedPip?.srcObject).toBe(remoteStream);
    const localPrimaryTile = container.querySelector<HTMLElement>(".call-grid__tile--local");
    const flipWhileSelfFullscreen = container.querySelector<HTMLButtonElement>(".call-grid__mobile-local-wrap [aria-label='Flip camera']");
    expect(localPrimaryTile?.classList.contains("call-grid__mobile-primary")).toBe(true);
    expect(localPrimaryTile?.getAttribute("role")).toBeNull();
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
    const remoteTile = container.querySelector(".call-grid__tile--remote") as HTMLDivElement;
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

    expect(remoteTile.tabIndex).toBe(0);
    expectOriginalStage();
    act(() => remoteTile.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    if (key === " ") {
      expectOriginalStage();
      act(() => remoteTile.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true })));
      expectSwappedStage();
    } else {
      expectSwappedStage();
    }
  });

  it("keeps participant taps out of the focus view and rotates screen share to landscape", () => {
    const screenTrack = { readyState: "live", kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const screenStream = { getVideoTracks: () => [screenTrack], getTracks: () => [screenTrack] } as unknown as MediaStream;
    const remoteStream = { getVideoTracks: () => [], getTracks: () => [] } as unknown as MediaStream;
    const container = renderScreen({
      ...baseProps,
      isScreenSharing: true,
      localScreenStream: screenStream,
      remoteMedia: [{ userId: "Alex", stream: remoteStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false }],
    });

    act(() => container.querySelector<HTMLElement>(".call-grid__tile--remote")?.click());
    expect(container.querySelector('[data-focus-main="Alex"]')).toBeNull();
    const rotate = container.querySelector<HTMLButtonElement>('[aria-label="Rotate landscape"]');
    expect(rotate).not.toBeNull();
    act(() => rotate?.click());

    expect(container.querySelector('[data-mobile-orientation="landscape"]')).not.toBeNull();
    expect(container.querySelector(".call-grid__focus-main, .call-grid__focus-participants, [data-focus-main]")).toBeNull();
    expect(container.querySelector(".call-grid__tile--screen")).not.toBeNull();
    expect(container.querySelector(".call-grid__tile--remote")).toBeNull();
    expect(container.querySelector(".mobile-active-controls")).not.toBeNull();
  });

  it("makes hidden mobile controls inert after timeout and restores interaction when the stage is tapped", () => {
    vi.useFakeTimers();
    localStorage.setItem("stovo.call-ui-preferences", JSON.stringify({ autoHideControls: true, cameraFit: "fit" }));
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

  it("hides mobile controls after the idle timeout when explicitly enabled", () => {
    vi.useFakeTimers();
    localStorage.clear();
    writeCallUIPreferences({ autoHideControls: true });
    const container = renderScreen(baseProps);
    const controls = container.querySelector(".mobile-active-controls")!;
    act(() => vi.advanceTimersByTime(30_000));
    expect(controls.getAttribute("aria-hidden")).toBe("true");
    expect(controls.hasAttribute("inert")).toBe(true);
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

  it("keeps the mobile camera PiP rectangular, with Flip available only while camera video is shown", () => {
    const css = readCssSource("src/styles.css");
    const pipRule = styleRules(css, ".mobile-active-pip");
    expect(pipRule).toMatch(/border-radius:\s*var\(--radius-control\)/);
    expect(pipRule).not.toMatch(/border-radius:\s*var\(--radius-circle\)/);

    const cameraOff = renderScreen(baseProps);
    expect(cameraOff.querySelector(".mobile-active-pip")).toBeNull();
    expect(cameraOff.querySelector('[aria-label="Flip camera"]')).toBeNull();
  });

  it("left-aligns the More menu to its trigger and keeps its three actions in the viewport", () => {
    const container = renderScreen(baseProps);
    act(() => container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]')?.click());
    const menu = container.querySelector<HTMLElement>('[role="group"][aria-label="More call options"]');
    expect(menu).not.toBeNull();
    expect(menu?.closest(".mobile-active-more-anchor")).not.toBeNull();
    const css = readCssSource("src/styles.css");
    const rule = styleRules(css, ".mobile-active-more-menu");
    expect(rule).toMatch(/left:\s*0/);
    expect(rule).toMatch(/right:\s*auto/);
    expect(rule).toMatch(/max-width:/);
  });

  it("clamps the real More menu before the right viewport edge while keeping it anchored to the trigger", () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    const anchorLeft = 278;
    const anchorWidth = 40;
    const menuWidth = 240;
    const rect = (left: number, width: number) => ({
      x: left, y: 0, left, top: 0, right: left + width, bottom: 180, width, height: 180,
      toJSON: () => ({}),
    }) as DOMRect;
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("mobile-active-more-anchor")) return rect(anchorLeft, anchorWidth);
      if (this.classList.contains("mobile-active-more-menu")) {
        const leftOffset = Number.parseFloat(this.style.left) || 0;
        const rightOffset = Number.parseFloat(this.style.right);
        let left = anchorLeft + leftOffset;
        if (this.style.position === "fixed") left = leftOffset;
        if (Number.isFinite(rightOffset)) {
          left = (this.style.position === "fixed" ? window.innerWidth : anchorLeft + anchorWidth) - rightOffset - menuWidth;
        }
        return rect(left, menuWidth);
      }
      return rect(0, 0);
    });

    try {
      const container = renderScreen(baseProps);
      act(() => container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]')?.click());
      const anchor = container.querySelector<HTMLElement>(".mobile-active-more-anchor");
      const menu = container.querySelector<HTMLElement>(".mobile-active-more-menu");
      expect(anchor).not.toBeNull();
      expect(menu).not.toBeNull();
      const anchorRect = anchor!.getBoundingClientRect();
      const menuRect = menu!.getBoundingClientRect();
      expect(menuRect.right).toBeLessThanOrEqual(window.innerWidth - 8);
      expect(menuRect.left).toBeGreaterThanOrEqual(8);
      expect(menuRect.left).toBeLessThan(anchorRect.left);
    } finally {
      bounds.mockRestore();
      if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
      else delete (window as Partial<Window>).innerWidth;
    }
  });

  it("resets the More-menu x offset in landscape and constrains width to the rotated viewport", () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    const rect = (left: number, width: number) => ({
      x: left, y: 0, left, top: 0, right: left + width, bottom: 180, width, height: 180,
      toJSON: () => ({}),
    }) as DOMRect;
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("mobile-active-more-anchor")) return rect(278, 40);
      if (this.classList.contains("mobile-active-more-menu")) {
        const offset = Number.parseFloat(this.style.left) || 0;
        return rect(278 + offset, 240);
      }
      return rect(0, 0);
    });

    try {
      const screenTrack = { readyState: "live", kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
      const stream = { getVideoTracks: () => [screenTrack], getTracks: () => [screenTrack] } as unknown as MediaStream;
      const container = renderScreen({ ...baseProps, isScreenSharing: true, localScreenStream: stream });
      const more = container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]');
      const rotate = container.querySelector<HTMLButtonElement>('[aria-label="Rotate landscape"]');
      expect(more).not.toBeNull();
      expect(rotate).not.toBeNull();

      act(() => more?.click());
      const portraitMenu = container.querySelector<HTMLElement>(".mobile-active-more-menu");
      expect(Number.parseFloat(portraitMenu?.style.left ?? "0")).toBeLessThan(0);
      act(() => rotate?.click());

      const landscape = container.querySelector<HTMLElement>('[data-mobile-orientation="landscape"]');
      const landscapeMenu = container.querySelector<HTMLElement>(".mobile-active-more-menu");
      expect(landscape).not.toBeNull();
      expect(landscapeMenu?.style.left).toBe("0px");
      const css = readCssSource("src/styles.css");
      const rule = styleRules(css, ".mobile-active-screen--landscape .mobile-active-more-menu");
      expect(rule).toMatch(/width:\s*min\(336px,\s*calc\(100dvh\s*-\s*32px\)\)/);
      expect(rule).toMatch(/max-width:\s*min\(336px,\s*calc\(100dvh\s*-\s*32px\)\)/);
    } finally {
      bounds.mockRestore();
      if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
      else delete (window as Partial<Window>).innerWidth;
    }
  });

  it("shows AI Notes, Recording and Live Captions together in the More menu", () => {
    const container = renderScreen(baseProps);
    act(() => container.querySelector<HTMLButtonElement>('.mobile-active-controls [aria-label="More options"]')?.click());
    const intelligence = container.querySelector('[role="group"][aria-label="Meeting features"]');
    expect(intelligence).not.toBeNull();
    act(() => intelligence?.querySelector<HTMLButtonElement>('[aria-label="Stovo Intelligence"]')?.click());
    expect(intelligence?.querySelector('[aria-label="Start AI Notes"]')).not.toBeNull();
    expect(intelligence?.querySelector('[aria-label="Start Recording"]')).not.toBeNull();
    const captions = intelligence?.querySelector<HTMLInputElement>('[aria-label="Live Captions unavailable"]');
    expect(captions).not.toBeNull();
    expect(captions?.disabled).toBe(true);
    expect(intelligence?.querySelector('[aria-label="Toggle Live Captions"]')).toBeNull();
  });

  it("uses a landscape screen-share stage without participant tiles, keeps controls, and closes back to portrait", () => {
    const screenTrack = { readyState: "live", kind: "video", addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const stream = { getVideoTracks: () => [screenTrack], getTracks: () => [screenTrack] } as unknown as MediaStream;
    const container = renderScreen({
      ...baseProps,
      isScreenSharing: true,
      localScreenStream: stream,
      remoteMedia: [{ userId: "Alex", stream: { getVideoTracks: () => [], getTracks: () => [] } as unknown as MediaStream, screenStream: null, hasVideo: false, hasAudio: true, hasScreenShare: false }],
    });
    expect(container.querySelector('[data-mobile-orientation="portrait"]')).not.toBeNull();
    expect(container.querySelector(".call-grid__tile--remote")).not.toBeNull();
    const rotate = container.querySelector<HTMLButtonElement>('[aria-label="Rotate landscape"]');
    expect(rotate).not.toBeNull();
    act(() => rotate?.click());

    const landscape = container.querySelector('[data-mobile-orientation="landscape"]');
    expect(landscape).not.toBeNull();
    expect(landscape?.querySelector(".call-grid__participant-rail, .call-grid__tile--remote")).toBeNull();
    expect(landscape?.querySelector(".mobile-active-controls")).not.toBeNull();
    const close = container.querySelector<HTMLButtonElement>('[aria-label="Close landscape view"]');
    expect(close).not.toBeNull();
    act(() => close?.click());
    expect(container.querySelector('[data-mobile-orientation="portrait"]')).not.toBeNull();
    expect(container.querySelector(".mobile-active-controls")).not.toBeNull();
    expect(container.querySelector(".call-grid__tile--remote")).not.toBeNull();
  });

});
