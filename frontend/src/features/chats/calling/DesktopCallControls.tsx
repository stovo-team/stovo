import {
  Captions,
  ArrowLeft,
  Maximize2,
  Mic,
  Minimize2,
  Phone,
  RotateCcw,
  ScreenShare,
  ScreenShareOff,
  Settings,
  Video,
  VideoOff,
  UserPlus,
} from "lucide-react";
import { TranscriptPanel } from "./TranscriptPanel";
import { CallPopupAudioStage } from "./CallPopupAudioStage";
import { useTranscription } from "./useTranscription";
import IconIntelligence from "../../../components/icons/IconIntelligence";
import { useCallRecording } from "./useCallRecording";
import { useLiveCaptions } from "./useLiveCaptions";
import { LiveCaptionsOverlay } from "./LiveCaptionsOverlay";
import { MeetingIntelligencePopover } from "./MeetingIntelligencePopover";
import { useEffect, useRef, useState } from "react";

import CallParticipantGrid from "../../../components/CallParticipantGrid";
import { hasLiveLocalVideo } from "../shared/callLifecycle";
import { useCallFeatureContext } from "./CallFeatureContext";
import { CallControlButton } from "./CallControlButton";
import { CallDeviceControls } from "./CallDeviceControls";
import { CallParticipantStage } from "./CallParticipantStage";
import { enableCallCamera } from "./callCamera";
import { SharedCallStage } from "./SharedCallStage";
import { CALL_CONTROLS_REVEAL_EVENT, SharedCallControlPanel } from "./SharedCallControlPanel";
import { useCallUIPreferences } from "./callUIPreferences";

/**
 * Call popup chrome shared by the header, video stage, invite panel, and
 * peer/avatar area, plus the desktop-only expanded/minimized control rows
 * (guarded by `!isMobileViewport`). Extracted verbatim from ChatsPage so the
 * remote/local video refs and their attached MediaStreams keep the exact
 * same DOM lifetime.
 */
export function DesktopCallControls({
  mockScreenShareOwner: providedMockScreenShareOwner,
}: {
  mockScreenShareOwner?: { userId: string; displayName: string } | null;
} = {}) {
  const { session, members, currentUser, isMobileViewport, chats, onOpenChat } = useCallFeatureContext();
  const { preferences: callUIPreferences } = useCallUIPreferences();
  const {
    callPhase,
    callType,
    setCallType,
    callNotice,
    isCallMinimized,
    setIsCallMinimized,
    hasRemoteVideo,
    callRemoteMedia,
    localVideoStream,
    localScreenStream,
    remoteVideoStream,
    remoteVideoRef,
    localVideoRef,
    audioCallRef,
    callAudioSettings,
    callAudioCapabilities,
    callAudioDevices,
    isCallInviteOpen,
    setIsCallInviteOpen,
    callParticipantIds,
    callInviteSelection,
    setCallInviteSelection,
    sendCallInvites,
    callPeerDisplayName,
    activeCallPeerName,
    isPeerSpeaking,
    isLocalSpeaking,
    speakingUserIds,
    callSettingsButtonRef,
    isCallSettingsMenuOpen,
    isCallAudioPopupOpen,
    setIsCallSettingsMenuOpen,
    setIsCallAudioPopupOpen,
    applyCallAudioPatch,
    toggleScreenShare,
    acceptIncomingCall,
    declineIncomingCall,
    endActiveCall,
    callRoomId,
    accessToken,
    socketRef
  } = session;
  useEffect(() => {
    const openInvite = () => setIsCallInviteOpen(true);
    window.addEventListener("stovo:open-call-invite", openInvite);
    return () => window.removeEventListener("stovo:open-call-invite", openInvite);
  }, [setIsCallInviteOpen]);

  const activeChat = session.activeCallChatId ? chats.find((c) => c.id === session.activeCallChatId) : null;
  const isVoiceChannel = activeChat?.type === "voice";
  const isGroupCall = activeChat?.type === "group" || activeChat?.type === "family";
  const mockScreenShareOwnerId = session.mockScreenShareUserId;
  const mockScreenShareOwnerUser = mockScreenShareOwnerId === currentUser?.id
    ? currentUser
    : [...members, ...(activeChat?.members ?? [])].find((member) => member.id === mockScreenShareOwnerId);
  const mockScreenShareOwner = providedMockScreenShareOwner ?? (mockScreenShareOwnerId
    ? { userId: mockScreenShareOwnerId, displayName: mockScreenShareOwnerUser?.displayName ?? mockScreenShareOwnerId }
    : null);

  const callTitle = (callPeerDisplayName ?? activeCallPeerName) ?? activeChat?.title ?? (isVoiceChannel ? "Voice Channel" : "Call");
  const callTimer = session.callTimer;
  const participantGridMedia = callRemoteMedia.length > 0
    ? callRemoteMedia
    : remoteVideoStream
      ? [{ userId: session.callPeerUserId ?? callPeerDisplayName ?? "Participant", stream: remoteVideoStream, screenStream: null, hasVideo: callType === "video" || hasRemoteVideo, hasAudio: true, hasScreenShare: false }]
      : [];
  const transcription = useTranscription({
    accessToken: accessToken ?? null,
    roomId: callRoomId,
    currentUserId: currentUser?.id ?? null,
    socketRef,
    localAudioStream: audioCallRef.current?.getLocalStream?.() ?? localVideoStream,
    enabled: true,
  });

  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false);
  const intelligenceButtonRef = useRef<HTMLButtonElement>(null);
  const [isParticipantFocused, setIsParticipantFocused] = useState(false); const closeParticipantFocusRef = useRef<() => void>(() => undefined);

  const recording = useCallRecording({
    accessToken: accessToken ?? null,
    roomId: callRoomId,
    socketRef,
    localStream: audioCallRef.current?.getLocalStream?.() ?? localVideoStream,
    localScreenStream: session.localScreenStream,
    remoteStreams: session.callRemoteMedia?.map((m) => ({ cameraStream: m.stream, screenStream: null })) ?? [],
    enabled: true,
  });

  const liveCaptions = useLiveCaptions({
    accessToken: accessToken ?? null,
    roomId: callRoomId,
    localAudioStream: audioCallRef.current?.getLocalStream?.() ?? localVideoStream,
    displayName: currentUser?.displayName ?? "You",
  });
  const {
    transcriptState,
    transcriptData,
    isTranscriptPanelOpen,
    toggleTranscriptPanel,
    startTranscription,
    stopTranscription,
  } = transcription;

  const handleToggleAiNotes = () => {
    if (transcriptState === "idle" || transcriptState === "failed") {
      void startTranscription();
    } else if (transcriptState === "recording") {
      void stopTranscription();
    }
  };

  // Keep recording/caption hooks mounted when the shared bar replaces the UI.
  if (isCallMinimized) return null;

  return (
    <>
      <LiveCaptionsOverlay
        isCaptionsEnabled={liveCaptions.isCaptionsEnabled}
        recentCaptions={liveCaptions.recentCaptions}
        currentInterimCaption={liveCaptions.currentInterimCaption}
        speakerDisplayName={currentUser?.displayName ?? "You"}
      />
      {/* ── Header row ── */}
      {!(isMobileViewport && !isCallMinimized && callPhase === "incoming") &&
        !(isCallMinimized && isMobileViewport) && (
      <div className="call-popup-header">
          <>
            {!(callPhase === "in-call" && callType === "video" && !isCallMinimized) && (
            <strong className="call-popup-status">
              {isCallMinimized
                ? (callPhase === "in-call"
                    ? `${callTitle} · ${callTimer}`
                    : callPhase === "incoming"
                    ? `${callTitle} · Incoming…`
                    : callPhase === "outgoing"
                    ? `${callTitle} · Ringing…`
                    : `${callTitle} · Connecting…`)
                : callPhase === "incoming"
                ? (callType === "video" ? "Incoming video call" : "Incoming call")
                : callPhase === "outgoing"
                ? "Ringing…"
                : callPhase === "connecting"
                ? "Connecting…"
                : isVoiceChannel
                ? (activeChat?.title ?? "Voice Channel")
                : isGroupCall
                ? (activeChat?.title ?? "Group call")
                : "Audio call"}
            </strong>
            )}
            {callNotice && (!isVoiceChannel || /failed|failure|error|denied|unsupported|not supported|timed out|offline|could not|unable|not available/i.test(callNotice)) && <span className="call-popup-notice">{callNotice}</span>}
          </>
        <div className="call-popup-header-actions">
          {isParticipantFocused && !isCallMinimized && (
            <button type="button" className="icon-button subtle call-participant-focus-back" aria-label="Back to participants" onClick={() => closeParticipantFocusRef.current()}><ArrowLeft aria-hidden="true" size={16} /></button>
          )}
          {callPhase !== "incoming" && !isCallMinimized && (isGroupCall || isParticipantFocused || session.callParticipantIds.length > 2 || (session.activeCallChatId && session.activeGroupCalls[session.activeCallChatId])) && (
            <button
              type="button"
              className="icon-button subtle"
              aria-label={isCallMinimized ? "Restore call window" : "Minimise call window"}
              onClick={() => setIsCallMinimized((v) => !v)}
            >
              {isCallMinimized ? (
                <Maximize2 aria-hidden="true" size={16} />
              ) : (
                <Minimize2 aria-hidden="true" size={16} />
              )}
            </button>
          )}
        </div>
        {callPhase === "in-call" && !isCallMinimized && !isMobileViewport && (
          <button type="button" className={`call-ctrl-btn call-ctrl-btn--invite call-popup-header-invite${isCallInviteOpen ? " is-active" : ""}`} aria-label="Invite people" title="Invite people" onClick={() => setIsCallInviteOpen((value) => !value)}>
            <UserPlus size={20} aria-hidden="true" />
          </button>
        )}
      </div>
      )}

      {/* ── Video area — always rendered so refs stay stable (hidden via CSS when unused) ── */}
      <SharedCallStage cameraFit={callUIPreferences.cameraFit} isSharing={Boolean(localScreenStream || callRemoteMedia.some((m) => m.hasScreenShare) || mockScreenShareOwner)} className={`call-popup-video-area${(isCallMinimized || (callType === "audio" && !hasRemoteVideo && !callAudioSettings.screenSharing && !callRemoteMedia.some((m) => m.hasScreenShare) && !localScreenStream && !mockScreenShareOwner && callRemoteMedia.length <= 1)) ? " call-popup-video-area-hidden" : ""}`}>
        {(callType === "video" || participantGridMedia.length > 1 || localScreenStream || participantGridMedia.some((media) => media.hasScreenShare) || mockScreenShareOwner) && (callPhase === "in-call" || (isGroupCall && callPhase === "connecting")) && !isCallMinimized ? (
          <CallParticipantGrid
            isCallConnected={callPhase === "in-call"}
            localStream={localVideoStream}
            localScreenStream={localScreenStream}
            remoteMedia={participantGridMedia}
            mockScreenShareOwner={mockScreenShareOwner}
            localUserLabel={currentUser?.displayName ?? "You"}
            mirrorLocal={
              callAudioSettings.mirrorLocalVideo &&
              callAudioSettings.cameraFacingMode === "user"
            }
            callType={callType}
            isLocalSpeaking={isLocalSpeaking}
            isLocalMuted={callAudioSettings.micMuted}
            isPeerSpeaking={isPeerSpeaking}
            speakingUserIds={speakingUserIds}
            onFocusChange={(focused, closeFocus) => { setIsParticipantFocused(focused); closeParticipantFocusRef.current = closeFocus; }}
          />
        ) : (
          <>
            <div className="call-popup-remote-video-wrap">
              <video
                disablePictureInPicture
                disableRemotePlayback
                controlsList="nofullscreen noremoteplayback"
                ref={remoteVideoRef}
                className={`call-popup-remote-video${(callType === "video" || hasRemoteVideo || callRemoteMedia.some((m) => m.hasScreenShare)) && callPhase === "in-call" && !isCallMinimized && !isMobileViewport ? " visible" : ""}`}
                autoPlay
                playsInline
              />
            </div>
            <div className="call-popup-local-video-wrap">
              <video
                disablePictureInPicture
                disableRemotePlayback
                controlsList="nofullscreen noremoteplayback"
                ref={localVideoRef}
                className={[
                  "call-popup-local-video",
                  (callType === "video" || callAudioSettings.screenSharing) && callPhase === "in-call" && !isCallMinimized && !isMobileViewport ? "visible" : "",
                  callAudioSettings.mirrorLocalVideo && callAudioSettings.cameraFacingMode === "user" && !callAudioSettings.screenSharing ? "mirrored" : "",
                ].filter(Boolean).join(" ")}
                autoPlay
                playsInline
                muted
              />
            </div>
          </>
        )}
      </SharedCallStage>

      {/* ── Call Invite Modal Overlay ── */}
      {isCallInviteOpen && callPhase === "in-call" && !isCallMinimized && (
        <div className="call-invite-modal" role="dialog" aria-label="Invite to call">
          <div className="call-invite-modal-header">
            <h3>Add members to call</h3>
            <button
              type="button"
              className="icon-button subtle"
              aria-label="Close invite modal"
              onClick={() => setIsCallInviteOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="call-invite-member-list">
            {members
              .filter((m) => m.id !== currentUser?.id && !callParticipantIds.includes(m.id))
              .map((member) => (
                <label key={member.id} className="call-invite-member-row">
                  <input
                    type="checkbox"
                    checked={callInviteSelection.includes(member.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setCallInviteSelection((prev) => [...prev, member.id]);
                      } else {
                        setCallInviteSelection((prev) => prev.filter((id) => id !== member.id));
                      }
                    }}
                  />
                  <span>{member.displayName}</span>
                </label>
              ))}
          </div>
          <div className="call-invite-modal-actions">
            <button
              type="button"
              className="action-button primary"
              disabled={callInviteSelection.length === 0}
              onClick={() => void sendCallInvites()}
            >
              Invite ({callInviteSelection.length})
            </button>
            <button
              type="button"
              className="action-button subtle"
              onClick={() => setIsCallInviteOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Peer name (incoming) ── */}
      {!isCallMinimized && callPhase === "incoming" && !(isMobileViewport && !isCallMinimized) && (
        <p className="call-popup-peer-name">{callPeerDisplayName ?? activeCallPeerName} is calling you.</p>
      )}

      <CallParticipantStage
        className="shared-call-stage call-popup-audio-stage"
        onPointerMove={() => window.dispatchEvent(new Event(CALL_CONTROLS_REVEAL_EVENT))}
      >
        <CallPopupAudioStage activeChat={activeChat ?? null} />
      </CallParticipantStage>

      {/* ── Controls row ── */}
      {!isCallMinimized && !isMobileViewport && (
        <SharedCallControlPanel autoHide={callUIPreferences.autoHideControls}>
        <div className="call-ctrl-row call-popup-ctrl-row shared-call-controls guest-call-controls">
          {callPhase === "incoming" && (
            <>
              <div className="call-ctrl-wrap">
                <button
                  type="button"
                  className="call-ctrl-btn accept-btn"
                  aria-label="Accept call"
                  onClick={() => void acceptIncomingCall()}
                >
                  <Phone aria-hidden="true" size={22} />
                </button>
                <span>Accept</span>
              </div>
              <div className="call-ctrl-wrap">
                <CallControlButton action="end-call" state="idle" className="call-ctrl-btn end-btn" label="Decline call" iconSize={22} onClick={declineIncomingCall} />
                <span>Decline</span>
              </div>
            </>
          )}
          {(callPhase === "outgoing" || callPhase === "connecting" || callPhase === "in-call") && (
            <>
              <CallDeviceControls
                settings={callAudioSettings}
                devices={callAudioDevices}
                capabilities={callAudioCapabilities}
                controlClassName="call-ctrl-btn"
                cameraActive={callType === "video" && callAudioSettings.cameraEnabled}
                showCamera={true}
                onPatch={(patch) => void applyCallAudioPatch(patch)}
                onToggleCamera={() => {
                  if (callType === "audio" || !hasLiveLocalVideo(localVideoStream)) {
                    void enableCallCamera(audioCallRef.current, setCallType, applyCallAudioPatch);
                  } else {
                    void applyCallAudioPatch({ cameraEnabled: !callAudioSettings.cameraEnabled });
                  }
                }}
              />
              {isMobileViewport && (
                <div className="call-ctrl-wrap">
                  <CallControlButton
                    action="audio-output"
                    toggle
                    state={callAudioSettings.speakerMode === "large" ? "active" : "idle"}
                    className="call-ctrl-btn"
                    label={callAudioSettings.speakerMode === "small" ? "Switch to loudspeaker" : "Switch to earpiece"}
                    onClick={() => void applyCallAudioPatch({ speakerMode: callAudioSettings.speakerMode === "small" ? "large" : "small" })}
                  />
                  <span>{callAudioSettings.speakerMode === "small" ? "Speaker" : "Earpiece"}</span>
                </div>
              )}
              <div className="call-ctrl-wrap">
                <button
                  ref={callSettingsButtonRef}
                  type="button"
                  className={`call-ctrl-btn${isCallSettingsMenuOpen || isCallAudioPopupOpen ? " is-active" : ""}`}
                  aria-label="Audio settings"
                  aria-haspopup="dialog"
                  aria-expanded={isCallSettingsMenuOpen || isCallAudioPopupOpen}
                  onClick={() => {
                    if (isCallAudioPopupOpen) {
                      setIsCallAudioPopupOpen(false);
                      setIsCallSettingsMenuOpen(false);
                    } else {
                      window.dispatchEvent(new CustomEvent("stovo:open-call-settings", { detail: "general" }));
                      setIsCallSettingsMenuOpen(false);
                      setIsCallAudioPopupOpen(true);
                    }
                  }}
                >
                  <Settings aria-hidden="true" size={20} />
                </button>
                <span>Settings</span>
              </div>

              {callPhase === "in-call" && (
                <>
                  <div className="call-ctrl-wrap">
                    <CallControlButton action="screen-share" state={callAudioSettings.screenSharing ? "active" : "idle"} className="call-ctrl-btn" label={callAudioSettings.screenSharing ? "Stop sharing screen" : "Share screen"} onClick={() => void toggleScreenShare()} />
                    <span>
                      {callAudioSettings.screenSharing ? "Stop sharing" : "Share screen"}
                    </span>
                  </div>
                  {isMobileViewport && callType === "video" && (
                    <div className="call-ctrl-wrap">
                      <CallControlButton
                        action="flip-camera"
                        state="idle"
                        className="call-ctrl-btn"
                        label="Flip camera"
                        onClick={() =>
                          void applyCallAudioPatch({
                            cameraFacingMode:
                              callAudioSettings.cameraFacingMode === "user" ? "environment" : "user",
                          })
                        }
                      />
                      <span>Flip</span>
                    </div>
                  )}
                </>
              )}
              {/* ── Stovo Intelligence button (AI Notes, Video Recording, Live Captions) ── */}
              <div className="call-ctrl-wrap" style={{ position: "relative" }}>
                <button
                  ref={intelligenceButtonRef}
                  id="call-ctrl-intelligence"
                  type="button"
                  className={`call-ctrl-btn call-ctrl-btn--intel${
                    isIntelligenceOpen || recording.isRecordingActive || transcriptState === "recording" ? " is-active" : ""
                  }`}
                  aria-label="Stovo Intelligence"
                  title="Stovo Intelligence (Notes, Recording, Captions)"
                  onClick={() => setIsIntelligenceOpen((open) => !open)}
                >
                  <IconIntelligence size={20} />
                </button>
                <span>Intelligence</span>

                <MeetingIntelligencePopover
                  isOpen={isIntelligenceOpen}
                  onClose={() => setIsIntelligenceOpen(false)}
                  anchorElement={intelligenceButtonRef.current}
                  notesState={transcriptState}
                  onToggleNotes={handleToggleAiNotes}
                  isNotesAllowed={true}
                  onOpenTranscriptPanel={toggleTranscriptPanel}
                  recordingState={recording.recordingState}
                  recordingTimer={recording.recordingTimer}
                  onToggleRecording={() => {
                    if (recording.recordingState === "idle" || recording.recordingState === "completed" || recording.recordingState === "failed") {
                      void recording.startRecording();
                    } else if (recording.recordingState === "recording") {
                      void recording.stopRecording();
                    }
                  }}
                  isRecordingAllowed={true}
                  isCaptionsEnabled={liveCaptions.isCaptionsEnabled}
                  onToggleCaptions={liveCaptions.toggleCaptions}
                    />
              </div>
              <div className="call-ctrl-wrap">
                <CallControlButton action="end-call" state="idle" className="call-ctrl-btn end-btn" label="End call" onClick={() => void endActiveCall()} />
                <span>End</span>
              </div>
              {/* Transcript side panel */}
              {isTranscriptPanelOpen && (
                <TranscriptPanel
                  data={transcriptData}
                  isLoading={transcriptState === "processing" || transcriptState === "stopping"}
                  onClose={toggleTranscriptPanel}
                />
              )}
            </>
          )}
        </div>
        </SharedCallControlPanel>
      )}

    </>
  );
}
