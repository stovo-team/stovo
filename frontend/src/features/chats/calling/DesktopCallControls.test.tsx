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

function renderDesktopControls({
  isPeerSpeaking = false,
  isLocalSpeaking = false,
  withRemoteVideo = false,
  sharing = false,
  callType = "video",
  activeChat = null,
  currentUser = null,
  overrides = {},
}: {
  overrides?: Partial<CallSessionApi>;
  isPeerSpeaking?: boolean;
  isLocalSpeaking?: boolean;
  withRemoteVideo?: boolean;
  callType?: "audio" | "video";
  sharing?: boolean;
  activeChat?: { id: string; type: string; title: string; members: Array<{ id: string; displayName: string; profilePhoto: null }> } | null;
  currentUser?: { id: string; displayName: string; profilePhoto: null } | null;
} = {}) {
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
    callType,
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
    localScreenStream: sharing ? mockRemoteStream : null,
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
    activeCallChatId: activeChat?.id ?? null,
    activeGroupCalls: activeChat ? {
      [activeChat.id]: {
        participants: [
          { userId: "self", state: "connected" },
          { userId: "peer", state: "connected" },
        ],
      },
    } : {},
    callTimer: "00:15",
    callPeerUserId: "peer",
    ...overrides,
  } as unknown as CallSessionApi;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  act(() => root.render(
    <CallFeatureProvider
      session={session}
      isMobileViewport={false}
      members={(activeChat?.members ?? []) as never}
      currentUser={currentUser as never}
      chats={(activeChat ? [activeChat] : []) as never}
    >
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

  it("keeps the invite action in the header above media", () => {
    const host = renderDesktopControls();
    expect(host.querySelector('.call-popup-header [aria-label="Invite people"]')).not.toBeNull();
    expect(host.querySelector('.call-popup-ctrl-row [aria-label="Invite people"]')).toBeNull();
  });

  it("shows only the presentation stage when an audio group call shares a screen", () => {
    const host = renderDesktopControls({ callType: "audio", sharing: true, activeChat: { id: "room", type: "group", title: "Room", members: [{ id: "self", displayName: "Self", profilePhoto: null }] }, currentUser: { id: "self", displayName: "Self", profilePhoto: null } });
    expect(host.querySelector('.call-grid__tile--screen')).not.toBeNull();
    expect(host.querySelector('.call-popup-group-participants')).toBeNull();
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

  it("shows voice-channel-style speaking states and group title in an audio group call", () => {
    const container = renderDesktopControls({
      callType: "audio",
      isPeerSpeaking: true,
      activeChat: {
        id: "group-chat",
        type: "group",
        title: "Project Room",
        members: [
          { id: "self", displayName: "Sam", profilePhoto: null },
          { id: "peer", displayName: "Alex", profilePhoto: null },
        ],
      },
      currentUser: { id: "self", displayName: "Sam", profilePhoto: null },
    });

    expect(container.querySelector(".call-popup-status")?.textContent).toBe("Project Room");
    expect(container.querySelectorAll(".call-popup-group-participant")).toHaveLength(2);
    expect(container.querySelector('.call-popup-group-participant[role="listitem"] .voice-participant-state')?.textContent).toBe("Connected");
    expect(container.querySelectorAll('.call-popup-group-participant.is-speaking .voice-participant-state')).toHaveLength(1);
    expect(container.querySelector('.call-popup-group-participant.is-speaking .voice-participant-state')?.textContent).toBe("Speaking…");
  });

  const group = {
    id: "group", type: "group", title: "Team",
    members: [{ id: "self", displayName: "Sam", profilePhoto: null }],
  };
  const self = { id: "self", displayName: "Sam", profilePhoto: null };

  it("keeps the self tile and camera controls visible while connecting", () => {
    const host = renderDesktopControls({ activeChat: group, currentUser: self, callType: "audio", isLocalSpeaking: true, overrides: { callPhase: "connecting", callParticipantIds: ["self"], callPeerUserId: null, activeGroupCalls: {} } });
    expect(host.querySelector(".call-popup-group-participant")?.textContent).toContain("Sam (You)");
    expect(host.querySelector(".call-popup-group-participant.is-speaking")).toBeNull();
    expect(host.querySelector('[aria-label="Toggle Camera"]')).not.toBeNull();
    expect(host.querySelector(".call-popup-group-participants")?.closest(".shared-call-stage")).not.toBeNull();
  });

  it("opens the shared audio dialog directly", () => {
    const openAudio = vi.fn();
    const openMenu = vi.fn();
    const host = renderDesktopControls({ overrides: { setIsCallAudioPopupOpen: openAudio, setIsCallSettingsMenuOpen: openMenu } });
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Audio settings"]')?.click());
    expect(openAudio).toHaveBeenCalledWith(true);
    expect(openMenu).not.toHaveBeenCalledWith(expect.any(Function));
  });

  it("shows the captured screen and participant rail without a second audio stage", () => {
    const track = { readyState: "live", enabled: true };
    const screen = { getVideoTracks: () => [track] } as unknown as MediaStream;
    const host = renderDesktopControls({ activeChat: group, currentUser: self, callType: "audio", overrides: { localScreenStream: screen, callAudioSettings: { ...DEFAULT_CALL_SETTINGS, screenSharing: true } } });
    expect(host.querySelector(".call-grid__tile--screen video")?.srcObject).toBe(screen);
    expect(host.querySelector(".call-popup-video-area-hidden")).toBeNull();
    expect(host.querySelector(".call-popup-group-participants")).toBeNull();
    expect(host.querySelector(".call-grid__participant-pin .call-grid__tile--local")).not.toBeNull();
  });

  it("uses one participant stage for a group video call with the camera off", () => {
    const host = renderDesktopControls({ activeChat: group, currentUser: self, overrides: { callAudioSettings: { ...DEFAULT_CALL_SETTINGS, cameraEnabled: false } } });
    expect(host.querySelector(".call-grid")).not.toBeNull();
    expect(host.querySelector(".call-popup-group-participants")).toBeNull();
  });

});
