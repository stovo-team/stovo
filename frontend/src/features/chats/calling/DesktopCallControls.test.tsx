import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./CallFeatureContext", () => ({
  useCallFeatureContext: () => ({
    session: {
      callPhase: "in-call",
      callType: "audio",
      callAudioSettings: { micMuted: false, speakerMode: "large", cameraEnabled: false, screenSharing: false, cameraFacingMode: "user", mirrorLocalVideo: false },
      callRemoteMedia: [],
      callParticipantIds: ["peer"],
      activeGroupCalls: {},
      callTimer: "00:42",
      localVideoStream: null,
      localScreenStream: null,
      remoteVideoStream: null,
      remoteVideoRef: { current: null },
      localVideoRef: { current: null },
      audioCallRef: { current: null },
      socketRef: { current: null },
      callSettingsButtonRef: { current: null },
      applyCallAudioPatch: vi.fn(),
      toggleScreenShare: vi.fn(),
      endActiveCall: vi.fn(),
      setCallType: vi.fn(),
      setIsCallMinimized: vi.fn(),
      setIsCallInviteOpen: vi.fn(),
      setCallInviteSelection: vi.fn(),
      setIsCallSettingsMenuOpen: vi.fn(),
      setIsCallAudioPopupOpen: vi.fn(),
    },
    isMobileViewport: false,
    members: [],
    currentUser: { id: "me", displayName: "Me", role: "member" },
    chats: [],
  }),
}));
vi.mock("./useTranscription", () => ({ useTranscription: () => ({
  transcriptState: "idle", transcriptData: [], isTranscriptPanelOpen: false,
  toggleTranscriptPanel: vi.fn(), startTranscription: vi.fn(), stopTranscription: vi.fn(),
}) }));
vi.mock("./useCallRecording", () => ({ useCallRecording: () => ({
  isRecordingActive: false, recordingState: "idle", recordingTimer: "00:00",
  startRecording: vi.fn(), stopRecording: vi.fn(),
}) }));
vi.mock("./useLiveCaptions", () => ({ useLiveCaptions: () => ({
  isCaptionsEnabled: false, recentCaptions: [], currentInterimCaption: "",
  targetLanguage: "en", toggleCaptions: vi.fn(), setTargetLanguage: vi.fn(),
}) }));
vi.mock("../sidebar/RealAvatar", () => ({ RealAvatar: () => null }));
vi.mock("./TranscriptPanel", () => ({ TranscriptPanel: () => null }));
vi.mock("./SpeakingWaveBadge", () => ({ SpeakingWaveBadge: () => null }));
vi.mock("./GuestMeetingLinkControl", () => ({ GuestMeetingLinkControl: () => null }));
vi.mock("../../../components/CallParticipantGrid", () => ({ default: () => null }));
vi.mock("./LiveCaptionsOverlay", () => ({ LiveCaptionsOverlay: () => null }));
vi.mock("./MeetingIntelligencePopover", () => ({
  MeetingBackgroundToast: () => null,
  MeetingIntelligencePopover: () => null,
}));

import { DesktopCallControls } from "./DesktopCallControls";

const roots: Root[] = [];
afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
});

function renderControls() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<DesktopCallControls />));
  return container;
}

describe("DesktopCallControls settings control", () => {
  it("keeps the accessible settings button without a visible caption below it", () => {
    const container = renderControls();
    const settingsButton = container.querySelector('button[aria-label="Audio settings"]');

    expect(settingsButton).not.toBeNull();
    expect(Array.from(container.querySelectorAll(".call-ctrl-wrap > span"))
      .some((caption) => caption.textContent?.trim() === "Settings")).toBe(false);
  });
});
