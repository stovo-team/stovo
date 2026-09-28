import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CallFeatureProvider } from "./CallFeatureContext";
import { DesktopCallControls } from "./DesktopCallControls";
import type { CallSessionApi } from "./useCallSession";
import { DEFAULT_CALL_SETTINGS } from "../../../realtime/call/types";

vi.mock("./useTranscription", () => ({
  useTranscription: () => ({
    transcriptState: "idle",
    transcriptData: null,
    isTranscriptPanelOpen: false,
    toggleTranscriptPanel: vi.fn(),
    startTranscription: vi.fn(),
    stopTranscription: vi.fn(),
  }),
}));
vi.mock("./useCallRecording", () => ({
  useCallRecording: () => ({
    isRecordingActive: false,
    recordingState: "idle",
    recordingTimer: "00:00",
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));
vi.mock("./useLiveCaptions", () => ({
  useLiveCaptions: () => ({
    isCaptionsEnabled: false,
    recentCaptions: [],
    currentInterimCaption: "",
    targetLanguage: "en",
    toggleCaptions: vi.fn(),
    setTargetLanguage: vi.fn(),
  }),
}));
vi.mock("./LiveCaptionsOverlay", () => ({ LiveCaptionsOverlay: () => null }));
vi.mock("./TranscriptPanel", () => ({ TranscriptPanel: () => null }));
vi.mock("./GuestMeetingLinkControl", () => ({ GuestMeetingLinkControl: () => null }));
vi.mock("./MeetingIntelligencePopover", () => ({
  MeetingBackgroundToast: () => null,
  MeetingIntelligencePopover: () => null,
}));

const mountedRoots: Root[] = [];

afterEach(() => {
  while (mountedRoots.length) act(() => mountedRoots.pop()?.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function renderDesktopControls({ isPeerSpeaking = false, isLocalSpeaking = false, withRemoteVideo = false } = {}) {
  const noop = vi.fn();
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
  const session = {
    callPhase: "in-call",
    callType: "video",
    setCallType: noop,
    callNotice: null,
    isCallMinimized: false,
    setIsCallMinimized: noop,
    hasRemoteVideo: withRemoteVideo,
    callRemoteMedia: withRemoteVideo ? [{
      userId: "peer",
      stream: mockRemoteStream,
      screenStream: null,
      hasVideo: true,
      hasAudio: true,
      hasScreenShare: false,
    }] : [],
    localVideoStream: null,
    localScreenStream: null,
    remoteVideoStream: null,
    remoteVideoRef: { current: null },
    localVideoRef: { current: null },
    audioCallRef: { current: null },
    callAudioSettings: DEFAULT_CALL_SETTINGS,
    callAudioCapabilities: {
      canSelectInputDevice: true,
      canSelectOutputDevice: true,
      canUseNoiseSuppression: true,
      canUseEchoCancellation: true,
      canUseAutoGainControl: true,
      canUseVoiceEnhancement: true,
      canUseCamera: true,
      canShareScreen: true,
    },
    callAudioDevices: [],
    isCallInviteOpen: false,
    setIsCallInviteOpen: noop,
    callParticipantIds: ["self", "peer"],
    callInviteSelection: [],
    setCallInviteSelection: noop,
    sendCallInvites: noop,
    callPeerDisplayName: "Alex Morgan",
    activeCallPeerName: "Alex Morgan",
    isPeerSpeaking,
    isLocalSpeaking,
    speakingUserIds: isPeerSpeaking ? ["peer"] : [],
    callSettingsButtonRef: { current: null },
    isCallSettingsMenuOpen: false,
    isCallAudioPopupOpen: false,
    setIsCallSettingsMenuOpen: noop,
    setIsCallAudioPopupOpen: noop,
    applyCallAudioPatch: noop,
    toggleScreenShare: noop,
    acceptIncomingCall: noop,
    declineIncomingCall: noop,
    endActiveCall: noop,
    callRoomId: null,
    accessToken: null,
    socketRef: { current: null },
    activeCallChatId: null,
    activeGroupCalls: {},
    callTimer: "00:15",
    callPeerUserId: "peer",
  } as unknown as CallSessionApi;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  act(() => root.render(
    <CallFeatureProvider session={session} isMobileViewport={false} members={[]} currentUser={null} chats={[]}>
      <DesktopCallControls />
    </CallFeatureProvider>,
  ));
  return host;
}

describe("DesktopCallControls visibility", () => {
  it("does not overlay a top-right audio wave badge on the remote video when speaking", () => {
    const container = renderDesktopControls({ isPeerSpeaking: true, withRemoteVideo: true });
    const speakingTile = container.querySelector<HTMLElement>(".call-grid__tile--remote.is-speaking");

    expect(speakingTile).not.toBeNull();
    expect(speakingTile?.querySelector("[role='status']")?.textContent).toContain("Speaking");
    expect(speakingTile?.querySelector("video")?.srcObject).not.toBeNull();
    expect(speakingTile?.querySelector(".speaking-wave-badge")).toBeNull();
  });

  it("keeps desktop controls visible after 15 seconds and pointer interactions", () => {
    vi.useFakeTimers();
    const container = renderDesktopControls();
    const controls = container.querySelector<HTMLElement>(".call-popup-ctrl-row");
    expect(controls).not.toBeNull();
    expect(controls?.getAttribute("aria-hidden")).toBeNull();
    act(() => vi.advanceTimersByTime(20_000));
    expect(controls?.getAttribute("aria-hidden")).toBeNull();
    expect(controls?.classList.contains("is-hidden")).toBe(false);

    act(() => controls?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Mute"]')?.click());
    expect(controls?.getAttribute("aria-hidden")).toBeNull();
    expect(controls?.classList.contains("is-hidden")).toBe(false);
  });

  it("keeps Stovo Intelligence directly available in the desktop call controls", () => {
    const container = renderDesktopControls();
    const intelligence = container.querySelector<HTMLButtonElement>('.call-ctrl-row [aria-label="Stovo Intelligence"]');
    expect(intelligence).not.toBeNull();
    expect(intelligence?.closest(".call-ctrl-wrap")).not.toBeNull();
  });

});
