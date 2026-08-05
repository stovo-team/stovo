import {
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

import type { User } from "../../../api/auth";
import CallParticipantGrid from "../../../components/CallParticipantGrid";
import { hasLiveLocalVideo } from "../shared/callLifecycle";
import type { CallSessionApi } from "./useCallSession";

export type DesktopCallControlsProps = {
  session: CallSessionApi;
  members: User[];
  currentUser: User | null;
  isMobileViewport: boolean;
};

/**
 * Call popup chrome shared by the header, video stage, invite panel, and
 * peer/avatar area, plus the desktop-only expanded/minimized control rows
 * (guarded by `!isMobileViewport`). Extracted verbatim from ChatsPage so the
 * remote/local video refs and their attached MediaStreams keep the exact
 * same DOM lifetime.
 */
export function DesktopCallControls({ session, members, currentUser, isMobileViewport }: DesktopCallControlsProps) {
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
    callSettingsButtonRef,
    isCallSettingsMenuOpen,
    isCallAudioPopupOpen,
    setIsCallSettingsMenuOpen,
    setIsCallAudioPopupOpen,
    applyCallAudioPatch,
    toggleScreenShare,
    acceptIncomingCall,
    declineIncomingCall,
    endActiveCall
  } = session;

  return (
    <>
      {/* ── Header row ── */}
      {!(isMobileViewport && !isCallMinimized && callPhase === "incoming") &&
        !(isCallMinimized && isMobileViewport) && (
      <div className="call-popup-header">
          <>
            {!(callPhase === "in-call" && callType === "video") && (
            <strong className="call-popup-status">
              {callPhase === "incoming"
                ? (callType === "video" ? "Incoming video call" : "Incoming call")
                : callPhase === "outgoing"
                ? "Ringing…"
                : callPhase === "connecting"
                ? "Connecting…"
                : "Audio call"}
            </strong>
            )}
            {callNotice && <span className="call-popup-notice">{callNotice}</span>}
          </>
        <div className="call-popup-header-actions">
          {callPhase !== "incoming" && !isCallMinimized && (
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
      <div className={`call-popup-video-area${(isCallMinimized || (callType === "audio" && !hasRemoteVideo && !callRemoteMedia.some((m) => m.hasScreenShare) && callRemoteMedia.length <= 1)) ? " call-popup-video-area-hidden" : ""}`}>
        {callRemoteMedia.length > 1 && callPhase === "in-call" && !isCallMinimized ? (
          <CallParticipantGrid
            localStream={localVideoStream}
            remoteMedia={callRemoteMedia}
            localUserLabel={currentUser?.displayName ?? "You"}
            mirrorLocal={
              callAudioSettings.mirrorLocalVideo &&
              callAudioSettings.cameraFacingMode === "user"
            }
            callType={callType}
          />
        ) : (
          <>
            <video
              ref={remoteVideoRef}
              className={`call-popup-remote-video${(callType === "video" || hasRemoteVideo || callRemoteMedia.some((m) => m.hasScreenShare)) && callPhase === "in-call" && !isCallMinimized && !isMobileViewport ? " visible" : ""}`}
              autoPlay
              playsInline
            />
            <video
              ref={localVideoRef}
              className={[
                "call-popup-local-video",
                callType === "video" && callPhase === "in-call" && !isCallMinimized && !isMobileViewport ? "visible" : "",
                callAudioSettings.mirrorLocalVideo &&
                callAudioSettings.cameraFacingMode === "user"
                  ? "mirrored"
                  : "",
              ].filter(Boolean).join(" ")}
              autoPlay
              playsInline
              muted
            />
          </>
        )}
      </div>

      {isCallInviteOpen && callPhase === "in-call" && !isCallMinimized && (
        <div className="call-invite-panel" style={{ padding: "8px 12px", maxHeight: 180, overflow: "auto" }}>
          <strong style={{ display: "block", marginBottom: 8 }}>Add people</strong>
          {members
            .filter((m) => m.id !== currentUser?.id && !callParticipantIds.includes(m.id))
            .map((m) => (
              <label key={m.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={callInviteSelection.includes(m.id)}
                  onChange={(e) => {
                    setCallInviteSelection((cur) =>
                      e.target.checked ? [...cur, m.id] : cur.filter((id) => id !== m.id),
                    );
                  }}
                />
                <span>{m.displayName}</span>
              </label>
            ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="primary-button" onClick={sendCallInvites}>
              Invite
            </button>
            <button type="button" className="secondary-button" onClick={() => setIsCallInviteOpen(false)}>
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
            {(callPeerDisplayName ?? activeCallPeerName) ? (callPeerDisplayName ?? activeCallPeerName)!.charAt(0).toUpperCase() : "?"}
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
                  {callAudioCapabilities.canShareScreen && (
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
                          <ScreenShareOff aria-hidden="true" size={20} />
                        ) : (
                          <ScreenShare aria-hidden="true" size={20} />
                        )}
                      </button>
                      <span>
                        {callAudioSettings.screenSharing ? "Stop sharing" : "Share screen"}
                      </span>
                    </div>
                  )}
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
            </>
          )}
        </div>
      )}

      {/* Minimized state: single-line chip controls (desktop only — mobile bar is in header) */}
      {isCallMinimized && !isMobileViewport && (
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
          {callPhase === "in-call" && callAudioCapabilities.canShareScreen && (
            <button
              type="button"
              className={`call-ctrl-btn call-chip-btn${callAudioSettings.screenSharing ? " is-active" : ""}`}
              aria-label={
                callAudioSettings.screenSharing ? "Stop sharing screen" : "Share screen"
              }
              onClick={() => void toggleScreenShare()}
            >
              {callAudioSettings.screenSharing ? (
                <ScreenShareOff aria-hidden="true" size={16} />
              ) : (
                <ScreenShare aria-hidden="true" size={16} />
              )}
            </button>
          )}
          <button
            type="button"
            className="call-ctrl-btn call-chip-btn end-btn"
            aria-label="End call"
            onClick={() => void endActiveCall()}
          >
            <svg aria-hidden="true" width={16} height={16} viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }} fill="currentColor">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>
          <button
            type="button"
            className="icon-button subtle call-chip-restore"
            aria-label="Restore call window"
            onClick={() => setIsCallMinimized(false)}
          >
            <Maximize2 aria-hidden="true" size={15} />
          </button>
        </div>
      )}
    </>
  );
}
