import {
  Captions,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  RotateCcw,
  ScreenShare,
  ScreenShareOff,
  Smartphone,
  SlidersHorizontal,
  Video,
  VideoOff,
  Volume2
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
import { useEffect, useState } from "react";

import CallParticipantGrid from "../../../components/CallParticipantGrid";
import { hasLiveLocalVideo } from "../shared/callLifecycle";
import { useCallFeatureContext } from "./CallFeatureContext";

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

  const transcription = useTranscription({
    accessToken: accessToken ?? null,
    roomId: callRoomId,
    currentUserId: currentUser?.id ?? null,
    socketRef,
    localAudioStream: audioCallRef.current?.getLocalStream?.() ?? localVideoStream,
    enabled: true,
  });

  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false);
  const [isAiNotesQueuedToastVisible, setIsAiNotesQueuedToastVisible] = useState(false);

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
            {callNotice && (!isVoiceChannel || /failed|failure|error|denied|unsupported|not supported|timed out|offline|could not|unable|not available/i.test(callNotice)) && <span className="call-popup-notice">{callNotice}</span>}
          </>
        <div className="call-popup-header-actions">
          {callPhase !== "incoming" && !isCallMinimized && (session.callParticipantIds.length > 2 || (session.activeCallChatId && session.activeGroupCalls[session.activeCallChatId])) && (
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
      <div className={`call-popup-video-area${(isCallMinimized || (callType === "audio" && !hasRemoteVideo && !callAudioSettings.screenSharing && !callRemoteMedia.some((m) => m.hasScreenShare) && callRemoteMedia.length <= 1)) ? " call-popup-video-area-hidden" : ""}`}>
        {(callRemoteMedia.length > 1 || localScreenStream || callRemoteMedia.some((media) => media.hasScreenShare)) && callPhase === "in-call" && !isCallMinimized ? (
          <CallParticipantGrid
            localStream={localVideoStream}
            localScreenStream={localScreenStream}
            remoteMedia={callRemoteMedia}
            localUserLabel={currentUser?.displayName ?? "You"}
            mirrorLocal={
              callAudioSettings.mirrorLocalVideo &&
              callAudioSettings.cameraFacingMode === "user"
            }
            callType={callType}
            isLocalSpeaking={isLocalSpeaking}
            isPeerSpeaking={isPeerSpeaking}
            speakingUserIds={speakingUserIds}
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
      </div>

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
        <div className="call-ctrl-row call-popup-ctrl-row">
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
                <button
                  type="button"
                  className="call-ctrl-btn end-btn"
                  aria-label="Decline call"
                  onClick={declineIncomingCall}
                >
                  <svg aria-hidden="true" width={22} height={22} viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }} fill="currentColor">
                    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                  </svg>
                </button>
                <span>Decline</span>
              </div>
            </>
          )}
          {(callPhase === "outgoing" || callPhase === "connecting" || callPhase === "in-call") && (
            <>
              <div className="call-ctrl-wrap">
                <button
                  type="button"
                  className={`call-ctrl-btn${callAudioSettings.micMuted ? " is-muted" : ""}`}
                  aria-label={callAudioSettings.micMuted ? "Unmute microphone" : "Mute microphone"}
                  onClick={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
                >
                  {callAudioSettings.micMuted ? (
                    <MicOff aria-hidden="true" size={20} />
                  ) : (
                    <Mic aria-hidden="true" size={20} />
                  )}
                </button>
                <span>{callAudioSettings.micMuted ? "Unmute" : "Mute"}</span>
              </div>
              {isMobileViewport && (
                <div className="call-ctrl-wrap">
                  <button
                    type="button"
                    className={`call-ctrl-btn${callAudioSettings.speakerMode === "large" ? " is-active" : ""}`}
                    aria-label={
                      callAudioSettings.speakerMode === "small"
                        ? "Switch to loudspeaker"
                        : "Switch to earpiece"
                    }
                    onClick={() =>
                      void applyCallAudioPatch({
                        speakerMode: callAudioSettings.speakerMode === "small" ? "large" : "small",
                      })
                    }
                  >
                    {callAudioSettings.speakerMode === "small" ? (
                      <Smartphone aria-hidden="true" size={20} />
                    ) : (
                      <Volume2 aria-hidden="true" size={20} />
                    )}
                  </button>
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
                    <button
                      type="button"
                      className={`call-ctrl-btn${callType === "video" && callAudioSettings.cameraEnabled ? "" : " is-muted"}`}
                      aria-label={
                        callType === "video" && callAudioSettings.cameraEnabled
                          ? "Turn off camera"
                          : "Turn on camera"
                      }
                      onClick={() => {
                        if (callType === "audio" || !hasLiveLocalVideo(localVideoStream)) {
                          setCallType("video");
                          void audioCallRef.current?.toggleVideo(true);
                        } else {
                          void applyCallAudioPatch({ cameraEnabled: !callAudioSettings.cameraEnabled });
                        }
                      }}
                    >
                      {callType === "video" && callAudioSettings.cameraEnabled ? (
                        <Video aria-hidden="true" size={20} />
                      ) : (
                        <VideoOff aria-hidden="true" size={20} />
                      )}
                    </button>
                    <span>
                      {callType === "video" && callAudioSettings.cameraEnabled ? "Camera" : "Camera off"}
                    </span>
                  </div>
                  <div className="call-ctrl-wrap">
                    <button
                      type="button"
                      className={`call-ctrl-btn${callAudioSettings.screenSharing ? " is-active" : ""}`}
                      aria-label={
                        callAudioSettings.screenSharing ? "Stop sharing screen" : "Share screen"
                      }
                      onClick={() => void toggleScreenShare()}
                    >
                      {callAudioSettings.screenSharing ? (
                        <ScreenShare aria-hidden="true" size={20} />
                      ) : (
                        <ScreenShareOff aria-hidden="true" size={20} />
                      )}
                    </button>
                    <span>
                      {callAudioSettings.screenSharing ? "Stop sharing" : "Share screen"}
                    </span>
                  </div>
                  {isMobileViewport && callType === "video" && (
                    <div className="call-ctrl-wrap">
                      <button
                        type="button"
                        className="call-ctrl-btn"
                        aria-label="Flip camera"
                        onClick={() =>
                          void applyCallAudioPatch({
                            cameraFacingMode:
                              callAudioSettings.cameraFacingMode === "user" ? "environment" : "user",
                          })
                        }
                      >
                        <RotateCcw aria-hidden="true" size={20} />
                      </button>
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
                <button
                  type="button"
                  className="call-ctrl-btn end-btn"
                  aria-label="End call"
                  onClick={() => void endActiveCall()}
                >
                  <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }} fill="currentColor">
                    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                  </svg>
                </button>
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
            <button
              type="button"
              className={`call-ctrl-btn call-chip-btn${callAudioSettings.micMuted ? " is-muted" : ""}`}
              aria-label={callAudioSettings.micMuted ? "Unmute" : "Mute"}
              onClick={() => void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted })}
            >
              {callAudioSettings.micMuted ? (
                <MicOff aria-hidden="true" size={16} />
              ) : (
                <Mic aria-hidden="true" size={16} />
              )}
            </button>
          )}
          {(callPhase === "outgoing" || callPhase === "connecting" || callPhase === "in-call") && (
            <button
              type="button"
              className={`call-ctrl-btn call-chip-btn call-chip-video${callType === "video" && callAudioSettings.cameraEnabled ? "" : " is-muted"}`}
              aria-label={
                callType === "video" && callAudioSettings.cameraEnabled
                  ? "Turn off camera"
                  : "Turn on camera"
              }
              onClick={() => {
                if (callType === "audio" || !hasLiveLocalVideo(localVideoStream)) {
                  setCallType("video");
                  void audioCallRef.current?.toggleVideo(true);
                } else {
                  void applyCallAudioPatch({ cameraEnabled: !callAudioSettings.cameraEnabled });
                }
              }}
            >
              {callType === "video" && callAudioSettings.cameraEnabled ? (
                <Video aria-hidden="true" size={16} />
              ) : (
                <VideoOff aria-hidden="true" size={16} />
              )}
            </button>
          )}
          {callPhase === "in-call" && (
            <button
              type="button"
              className={`call-ctrl-btn call-chip-btn${callAudioSettings.screenSharing ? " is-active" : ""}`}
              aria-label={
                callAudioSettings.screenSharing ? "Stop sharing screen" : "Share screen"
              }
              onClick={() => void toggleScreenShare()}
            >
              {callAudioSettings.screenSharing ? (
                <ScreenShare aria-hidden="true" size={16} />
              ) : (
                <ScreenShareOff aria-hidden="true" size={16} />
              )}
            </button>
          )}
          <button
            type="button"
            className="call-ctrl-btn call-chip-btn end-btn"
            aria-label={isVoiceChannel ? "Disconnect from voice channel" : "End call"}
            title={isVoiceChannel ? "Disconnect from voice channel" : "End call"}
            onClick={() => void endActiveCall()}
          >
            <svg aria-hidden="true" width={16} height={16} viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }} fill="currentColor">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>
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
