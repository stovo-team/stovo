/** Browser regression fixture: real call UI with deterministic canvas media, no signaling server. */
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { MemoryRouter } from "react-router-dom";
import { CallFeature, CallFeatureProvider } from "../src/features/chats/calling/CallFeature";
import { VoiceChannelStage } from "../src/features/chats/calling/VoiceChannelStage";
import { DEFAULT_CALL_SETTINGS } from "../src/realtime/call/types";
import type { CallSessionApi } from "../src/features/chats/calling/useCallSession";
import type { Chat } from "../src/api/chats";
import type { User } from "../src/api/auth";
import "../src/design-system/tokens.css";
import "../src/styles.css";

const params = new URLSearchParams(location.search);
const voice = params.get("kind") === "voice";
const withDevices = params.has("devices");
if (params.has("android")) {
  Capacitor.isNativePlatform = () => true;
  Capacitor.getPlatform = () => "android";
}
if (params.has("controls-visible")) {
  localStorage.setItem("stovo.call-ui-preferences", JSON.stringify({ autoHideControls: false, cameraFit: "fit" }));
}
const self = { id: "self", displayName: "Test User", profilePhoto: null } as User;
const chat = { id: "group", title: "Test call", type: voice ? "voice" : "group", members: [self], activeCall: { participants: [{ userId: "self", state: "connected" }] } } as unknown as Chat;
function media(color: string) {
  const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 720;
  const context = canvas.getContext("2d")!; context.fillStyle = color; context.fillRect(0, 0, 1280, 720);
  context.fillStyle = "white"; context.font = "64px sans-serif"; context.fillText("Landscape 16:9", 50, 100);
  return canvas.captureStream(1);
}
const cameraStream = media("#164e63"), screenStream = media("#4c1d95");
const noop = () => undefined;
function Fixture() {
  const [settings, setSettings] = useState({ ...DEFAULT_CALL_SETTINGS, screenSharing: params.has("sharing"), cameraEnabled: params.has("camera") });
  const [audioOpen, setAudioOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState<"audio" | "video">(params.has("camera") ? "video" : "audio");
  const [phase, setPhase] = useState("in-call");
  const audioCallRef = useRef(null), socketRef = useRef(null), remoteVideoRef = useRef(null), localVideoRef = useRef(null), callSettingsButtonRef = useRef(null), callSettingsMenuRef = useRef(null), callAudioPopupRef = useRef(null), remoteAudioRef = useRef(null);
  const session = {
    callPhase: phase, callType: type, setCallType: setType, activeCallChatId: "group", activeGroupCalls: { group: chat.activeCall },
    callAudioSettings: settings, callAudioCapabilities: { canUseCamera: true, canShareScreen: true, canSelectInputDevice: withDevices, canSelectOutputDevice: withDevices }, callAudioDevices: withDevices ? [{ deviceId: "mock-microphone", kind: "audioinput", label: "Desk microphone" }] : [], callRemoteMedia: [],
    callParticipantIds: ["self"], callInviteSelection: [], isCallInviteOpen: false,
    localVideoStream: settings.cameraEnabled ? cameraStream : null, localScreenStream: settings.screenSharing ? screenStream : null,
    remoteVideoStream: null, hasRemoteVideo: false, speakingUserIds: [], isLocalSpeaking: false, isPeerSpeaking: false,
    callTimer: "00:00", callRoomId: null, accessToken: null, callNotice: null,
    isCallMinimized: minimized, setIsCallMinimized: setMinimized, isCallSettingsMenuOpen: false,
    isCallAudioPopupOpen: audioOpen, setIsCallAudioPopupOpen: setAudioOpen, isCallVideoPopupOpen: videoOpen, setIsCallVideoPopupOpen: setVideoOpen,
    audioCallRef, socketRef, remoteVideoRef, localVideoRef, callSettingsButtonRef, callSettingsMenuRef, callAudioPopupRef, remoteAudioRef,
    applyCallAudioPatch: async (patch: object) => setSettings((current) => ({ ...current, ...patch })),
    toggleScreenShare: async () => setSettings((current) => ({ ...current, screenSharing: !current.screenSharing })),
    endActiveCall: async () => setPhase("idle"), setIsCallSettingsMenuOpen: noop, setIsCallInviteOpen: noop, setCallInviteSelection: noop,
    sendCallInvites: noop, acceptIncomingCall: noop, declineIncomingCall: noop,
  } as unknown as CallSessionApi;
  return <MemoryRouter initialEntries={["/app/chats/group"]}>
    <main style={{ height: "100vh", background: "#334155" }}>Chat behind call</main>
    <CallFeatureProvider session={session} isMobileViewport={params.has("mobile")} currentUser={self} members={[self]} chats={[chat]}>
      <CallFeature />
      {voice && <div style={{ position: "fixed", inset: expanded ? "0" : "80px auto auto 80px", width: expanded ? "100vw" : "620px", height: expanded ? "100vh" : "560px", zIndex: 100 }}>
        <VoiceChannelStage chat={chat} session={session} members={[self]} currentUser={self} accessToken={null} canAddPeople onOpenAddPeople={noop} isExpanded={expanded} onToggleExpanded={() => setExpanded((value) => !value)} />
      </div>}
    </CallFeatureProvider>
  </MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
