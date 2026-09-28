import {
  Captions,
  ArrowLeft,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  RotateCcw,
  ScreenShare,
  ScreenShareOff,
  SlidersHorizontal,
  Video,
  VideoOff,
} from "lucide-react";
import { RealAvatar } from "../sidebar/RealAvatar";
import { TranscriptPanel } from "./TranscriptPanel";
import { useTranscription } from "./useTranscription";
import { SpeakingWaveBadge } from "./SpeakingWaveBadge";
import { GuestMeetingLinkControl } from "./GuestMeetingLinkControl";
import IconIntelligence from "../../../components/icons/IconIntelligence";
import { useCallRecording } from "./useCallRecording";
import { useLiveCaptions } from "./useLiveCaptions";
import { LiveCaptionsOverlay } from "./LiveCaptionsOverlay";
import { MeetingBackgroundToast, MeetingIntelligencePopover } from "./MeetingIntelligencePopover";
import { useEffect, useRef, useState } from "react";

import CallParticipantGrid from "../../../components/CallParticipantGrid";
import { hasLiveLocalVideo } from "../shared/callLifecycle";
import { useCallFeatureContext } from "./CallFeatureContext";
import { CallControlButton } from "./CallControlButton";
import { CallDeviceControls } from "./CallDeviceControls";
import { CallParticipantStage } from "./CallParticipantStage";

/**
 * Call popup chrome shared by the header, video stage, invite panel, and
 * peer/avatar area, plus the desktop-only expanded/minimized control rows
 * (guarded by `!isMobileViewport`). Extracted verbatim from ChatsPage so the
 * remote/local video refs and their attached MediaStreams keep the exact
 * same DOM lifetime.
 */
export function DesktopCallControls() {
  const { session, members, currentUser, isMobileViewport, chats, onOpenChat } = useCallFeatureContext();
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

  const activeChat = session.activeCallChatId ? chats.find((c) => c.id === session.activeCallChatId) : null;
  const isVoiceChannel = activeChat?.type === "voice";

  const activePeer = members.find((m) => m.id === session.callPeerUserId) ||
    activeChat?.members?.find((m) => m.id === session.callPeerUserId) ||
    activeChat?.members?.find((m) => m.id !== currentUser?.id);
  const peerProfilePhoto = activePeer?.profilePhoto ?? null;

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

  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false); const [isAiNotesQueuedToastVisible, setIsAiNotesQueuedToastVisible] = useState(false);
  const [isParticipantFocused, setIsParticipantFocused] = useState(false); const closeParticipantFocusRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!isAiNotesQueuedToastVisible) return;
    const timer = window.setTimeout(() => setIsAiNotesQueuedToastVisible(false), 5_000);
    return () => window.clearTimeout(timer);
  }, [isAiNotesQueuedToastVisible]);

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
    defaultLanguage: "en",
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
      // The recorder flush and server-side transcription continue independently
      // of this popover, so release the user back to the call immediately.
      setIsIntelligenceOpen(false);
      setIsAiNotesQueuedToastVisible(true);
      void stopTranscription();
    }
  };

  return (
    <>
      <MeetingBackgroundToast visible={isAiNotesQueuedToastVisible} />
      <LiveCaptionsOverlay
        isCaptionsEnabled={liveCaptions.isCaptionsEnabled}
        recentCaptions={liveCaptions.recentCaptions}
        currentInterimCaption={liveCaptions.currentInterimCaption}
        targetLanguage={liveCaptions.targetLanguage}
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
                : "Audio call"}
            </strong>
            )}
            {callNotice && <span className="call-popup-notice">{callNotice}</span>}
          </>
        <div className="call-popup-header-actions">
          {isParticipantFocused && !isCallMinimized && (
            <button type="button" className="icon-button subtle call-participant-focus-back" aria-label="Back to participants" onClick={() => closeParticipantFocusRef.current()}><ArrowLeft aria-hidden="true" size={16} /></button>
          )}
          {callPhase !== "incoming" && !isCallMinimized && (isParticipantFocused || session.callParticipantIds.length > 2 || (session.activeCallChatId && session.activeGroupCalls[session.activeCallChatId])) && (
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
      </div>
      )}

      {/* ── Video area — always rendered so refs stay stable (hidden via CSS when unused) ── */}
      <CallParticipantStage className={`shared-call-stage call-popup-video-area${(isCallMinimized || (callType === "audio" && !hasRemoteVideo && !callAudioSettings.screenSharing && !callRemoteMedia.some((m) => m.hasScreenShare) && callRemoteMedia.length <= 1)) ? " call-popup-video-area-hidden" : ""}`}>
        {(callType === "video" || participantGridMedia.length > 1 || localScreenStream || participantGridMedia.some((media) => media.hasScreenShare)) && callPhase === "in-call" && !isCallMinimized ? (
          <CallParticipantGrid
            localStream={localVideoStream}
            localScreenStream={localScreenStream}
            remoteMedia={participantGridMedia}
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
                ref={remoteVideoRef}
                className={`call-popup-remote-video${(callType === "video" || hasRemoteVideo || callRemoteMedia.some((m) => m.hasScreenShare)) && callPhase === "in-call" && !isCallMinimized && !isMobileViewport ? " visible" : ""}`}
                autoPlay
                playsInline
              />
              {isPeerSpeaking && (callType === "video" || hasRemoteVideo || callRemoteMedia.some((m) => m.hasScreenShare)) && callPhase === "in-call" && !isCallMinimized && !isMobileViewport && (
                <SpeakingWaveBadge />
              )}
            </div>
            <div className="call-popup-local-video-wrap">
              <video
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
              {isLocalSpeaking && (callType === "video" || callAudioSettings.screenSharing) && callPhase === "in-call" && !isCallMinimized && !isMobileViewport && (
                <SpeakingWaveBadge className="speaking-wave-badge--pip" />
              )}
            </div>
          </>
        )}
      </CallParticipantStage>

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
          <GuestMeetingLinkControl accessToken={accessToken ?? null} chatId={activeChat?.id ?? null} sourceChat={activeChat} currentUserId={currentUser?.id} enabled={(activeChat?.type === "group" || activeChat?.type === "direct" || activeChat?.type === "family") && (currentUser?.role === "owner" || currentUser?.permissions?.includes("manage_calls") === true)} />
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

      {/* Avatar area — shown when no remote video is playing */}
      {!isCallMinimized && (callType === "audio" || !callAudioSettings.cameraEnabled) && !hasRemoteVideo && !callRemoteMedia.some((m) => m.hasScreenShare) && callPhase === "in-call" && !isMobileViewport && (
        <div className="call-popup-avatar-area">
          <div className="call-popup-avatar-circle">
            <RealAvatar
              accessToken={accessToken ?? null}
              className="avatar call-popup-real-avatar"
              file={peerProfilePhoto}
              label={callPeerDisplayName ?? activeCallPeerName ?? "Call"}
            />
            <div className={`call-popup-avatar-ring${isPeerSpeaking ? "" : " silent"}`} />
            <div className={`call-popup-avatar-ring${isPeerSpeaking ? "" : " silent"}`} />
          </div>
          <div className="call-popup-waveform">
            {[0,1,2,3,4].map((i) => (
              <div key={i} className={`call-popup-wave-bar${isPeerSpeaking ? "" : " silent"}`} />
            ))}
          </div>
        </div>
      )}

      {/* ── Controls row ── */}
      {!isCallMinimized && !isMobileViewport && (
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
                showCamera={callPhase === "in-call"}
                onPatch={(patch) => void applyCallAudioPatch(patch)}
                onToggleCamera={() => {
                  if (callType === "audio" || !hasLiveLocalVideo(localVideoStream)) {
                    setCallType("video");
                    void audioCallRef.current?.toggleVideo(true);
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
                      setIsCallSettingsMenuOpen((v) => !v);
                    }
                  }}
                >
                  <SlidersHorizontal aria-hidden="true" size={20} />
                </button>
                <span>Settings</span>
              </div>
              {callPhase === "in-call" && (
                <div className="call-ctrl-wrap">
                  <button
                    type="button"
                    className={`call-ctrl-btn call-ctrl-btn--invite${isCallInviteOpen ? " is-active" : ""}`}
                    aria-label="Invite people"
                    title="Invite people"
                    onClick={() => setIsCallInviteOpen((v) => !v)}
                  >
                    <span className="ms-icon ms-icon--20" aria-hidden={true}>person_add</span>
                  </button>
                  <span>Invite</span>
                </div>
              )}
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
                  targetLanguage={liveCaptions.targetLanguage}
                  onChangeTargetLanguage={liveCaptions.setTargetLanguage}
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
      )}

      {/* Minimized state: single-line chip controls (desktop only — mobile bar is in header) */}
      {isCallMinimized && !isMobileViewport && callPhase !== "idle" && (
        <div className="call-status-chip-controls">
          {(callPhase === "outgoing" || callPhase === "connecting" || callPhase === "in-call") && (
            <CallControlButton action="microphone" state={callAudioSettings.micMuted ? "muted" : "active"} className="call-ctrl-btn call-chip-btn" label={callAudioSettings.micMuted ? "Unmute" : "Mute"} iconSize={16} onClick={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })} />
          )}
          {(callPhase === "outgoing" || callPhase === "connecting" || callPhase === "in-call") && (
            <CallControlButton
              action="camera"
              state={callType === "video" && callAudioSettings.cameraEnabled ? "active" : "muted"}
              className="call-ctrl-btn call-chip-btn call-chip-video"
              label={callType === "video" && callAudioSettings.cameraEnabled ? "Turn off camera" : "Turn on camera"}
              iconSize={16}
              onClick={() => {
                if (callType === "audio" || !hasLiveLocalVideo(localVideoStream)) {
                  setCallType("video");
                  void audioCallRef.current?.toggleVideo(true);
                } else {
                  void applyCallAudioPatch({ cameraEnabled: !callAudioSettings.cameraEnabled });
                }
              }}
            />
          )}
          {callPhase === "in-call" && (
            <CallControlButton action="screen-share" state={callAudioSettings.screenSharing ? "active" : "idle"} className="call-ctrl-btn call-chip-btn" label={callAudioSettings.screenSharing ? "Stop sharing screen" : "Share screen"} iconSize={16} onClick={() => void toggleScreenShare()} />
          )}
          <CallControlButton action="end-call" state="idle" className="call-ctrl-btn call-chip-btn end-btn" label={isVoiceChannel ? "Disconnect from voice channel" : "End call"} title={isVoiceChannel ? "Disconnect from voice channel" : "End call"} iconSize={16} onClick={() => void endActiveCall()} />
          <button
            type="button"
            className="icon-button subtle call-chip-restore"
            aria-label={isVoiceChannel ? "Enlarge voice channel" : "Restore call window"}
            title={isVoiceChannel ? "Enlarge voice channel" : "Restore call window"}
            onClick={() => {
              setIsCallMinimized(false);
              if (session.activeCallChatId && onOpenChat && chats.length > 0) {
                const target = chats.find((c) => c.id === session.activeCallChatId);
                if (target) onOpenChat(target);
              }
            }}
          >
            <Maximize2 aria-hidden="true" size={15} />
          </button>
        </div>
      )}
    </>
  );
}
