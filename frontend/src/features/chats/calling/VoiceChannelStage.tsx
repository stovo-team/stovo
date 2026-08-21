import {
  useEffect,
  useRef,
  useState
} from "react";
import {
  FileText,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MoreVertical,
  PhoneOff,
  Settings,
  Sparkles,
  Video,
  VideoOff,
  Volume2
} from "lucide-react";

import { useStrings } from "../../../i18n/LanguageContext";
import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import type { CallSessionApi } from "./useCallSession";
import { RealAvatar } from "../sidebar/RealAvatar";
import { TranscriptPanel } from "./TranscriptPanel";
import { useTranscription } from "./useTranscription";
import { hasLiveLocalVideo } from "../shared/callLifecycle";

export type VoiceChannelStageProps = {
  chat: Chat;
  session: CallSessionApi;
  members: User[];
  currentUser: User | null;
  accessToken: string | null;
};

export function VoiceChannelStage({
  chat,
  session,
  members,
  currentUser,
  accessToken,
}: VoiceChannelStageProps) {
  const strings = useStrings();
  const voiceStrings = strings.chats.voiceRoom;
  const {
    callPhase,
    callType,
    setCallType,
    activeCallChatId,
    callNotice,
    callAudioSettings,
    callAudioCapabilities,
    callRemoteMedia,
    applyCallAudioPatch,
    toggleScreenShare,
    endActiveCall,
    joinVoiceChannel,
    isPeerSpeaking,
    activeGroupCalls,
    setIsCallSettingsMenuOpen,
    setIsCallAudioPopupOpen,
    setIsCallMinimized,
    callRoomId,
    socketRef,
    localVideoStream,
    audioCallRef
  } = session;

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const fallbackSocketRef = useRef(null);

  const transcription = useTranscription({
    accessToken: accessToken ?? session.accessToken ?? null,
    roomId: callRoomId ?? (chat.activeCall?.roomId ?? null),
    currentUserId: currentUser?.id ?? null,
    socketRef: socketRef ?? session.socketRef ?? fallbackSocketRef,
    localVideoStream: localVideoStream ?? session.localVideoStream,
    enabled: true,
  });

  const {
    transcriptState,
    transcriptData,
    isTranscriptPanelOpen,
    toggleTranscriptPanel,
    startTranscription,
    stopTranscription,
  } = transcription;

  // Close more menu when clicking outside
  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(e.target as Node) &&
        moreButtonRef.current &&
        !moreButtonRef.current.contains(e.target as Node)
      ) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMoreMenuOpen]);

  const isCurrentChannelActive = activeCallChatId === chat.id && callPhase !== "idle";
  const isConnecting = activeCallChatId === chat.id && callPhase === "connecting";
  const activeCall = activeGroupCalls[chat.id] || chat.activeCall;
  const rawParticipants = (activeCall?.participants as Array<{ userId: string; state: string; role: string }>) || [];
  
  // Active participants currently in the room
  const activeParticipants = rawParticipants.filter(
    (p) => p.state === "connected" || p.state === "connecting" || p.state === "in-call"
  );

  // If local user is active/connecting, make sure they are in the active participants list
  const displayParticipants: Array<{ userId: string; state: string; role: string }> = [...activeParticipants];
  if (isCurrentChannelActive && currentUser && !displayParticipants.some((p) => p.userId === currentUser.id)) {
    displayParticipants.push({
      userId: currentUser.id,
      state: isConnecting ? "connecting" : "connected",
      role: "member"
    });
  }
  if (isCurrentChannelActive && session.callParticipantIds?.length) {
    for (const pid of session.callParticipantIds) {
      if (!displayParticipants.some((p) => p.userId === pid)) {
        displayParticipants.push({
          userId: pid,
          state: "connected",
          role: "member"
        });
      }
    }
  }

  const chatMembers = (chat.members as unknown as User[]) || members || [];

  const handleToggleMic = () => {
    void applyCallAudioPatch({ micMuted: !callAudioSettings.micMuted });
  };

  const handleToggleVideo = () => {
    const isCurrentlyActive = callAudioSettings.cameraEnabled;
    if (!isCurrentlyActive) {
      if (setCallType) setCallType("video");
      void applyCallAudioPatch({ cameraEnabled: true });
      void audioCallRef?.current?.toggleVideo(true);
    } else {
      void applyCallAudioPatch({ cameraEnabled: false });
      void audioCallRef?.current?.toggleVideo(false);
    }
  };

  const handleToggleScreenShare = () => {
    void toggleScreenShare();
  };

  const handleJoin = () => {
    void joinVoiceChannel(chat, { micMuted: false, cameraEnabled: false });
  };

  const handleLeave = () => {
    setIsMoreMenuOpen(false);
    void endActiveCall();
  };

  const handleOpenSettings = () => {
    setIsMoreMenuOpen(false);
    if (setIsCallAudioPopupOpen) {
      setIsCallAudioPopupOpen(true);
    } else if (setIsCallSettingsMenuOpen) {
      setIsCallSettingsMenuOpen(true);
    }
  };

  const handleToggleAiNotes = () => {
    setIsMoreMenuOpen(false);
    if (transcriptState === "idle" || transcriptState === "failed") {
      void startTranscription();
    } else if (transcriptState === "recording") {
      void stopTranscription();
    } else {
      toggleTranscriptPanel();
    }
  };

  const resolveMemberInfo = (userId: string) => {
    if (currentUser && userId === currentUser.id) {
      const foundSelf = chatMembers.find((m) => m.id === currentUser.id) || (members && members.find((m) => m.id === currentUser.id));
      return {
        displayName: currentUser.displayName ? `${currentUser.displayName} (You)` : "You",
        rawDisplayName: currentUser.displayName || "You",
        profilePhoto: currentUser.profilePhoto ?? foundSelf?.profilePhoto ?? null,
        isSelf: true
      };
    }
    const found = chatMembers.find((m) => m.id === userId) || (members && members.find((m) => m.id === userId));
    return {
      displayName: found?.displayName || "Member",
      rawDisplayName: found?.displayName || "Member",
      profilePhoto: found?.profilePhoto ?? null,
      isSelf: false
    };
  };

  const participantCount = displayParticipants.length;
  const isAnotherCallActive = callPhase !== "idle" && activeCallChatId !== chat.id;

  let gridTierClass = "voice-grid--1";
  let avatarTierClass = "voice-avatar--xl";
  let wrapperTierClass = "voice-avatar-wrapper--xl";

  if (participantCount === 2) {
    gridTierClass = "voice-grid--2";
    avatarTierClass = "voice-avatar--lg";
    wrapperTierClass = "voice-avatar-wrapper--lg";
  } else if (participantCount === 3 || participantCount === 4) {
    gridTierClass = "voice-grid--4";
    avatarTierClass = "voice-avatar--md";
    wrapperTierClass = "voice-avatar-wrapper--md";
  } else if (participantCount === 5 || participantCount === 6) {
    gridTierClass = "voice-grid--6";
    avatarTierClass = "voice-avatar--sm";
    wrapperTierClass = "voice-avatar-wrapper--sm";
  } else if (participantCount >= 7 && participantCount <= 9) {
    gridTierClass = "voice-grid--9";
    avatarTierClass = "voice-avatar--sm";
    wrapperTierClass = "voice-avatar-wrapper--sm";
  }

  const isListMode = participantCount > 9;

  return (
    <div className={`voice-channel-room${isCurrentChannelActive ? " is-connected" : ""}`} role="region" aria-label="Voice Channel Room">
      {/* Notice Banner */}
      {callNotice && (
        <div className="voice-room-notice-banner" role="status" aria-live="polite">
          <span>{callNotice}</span>
        </div>
      )}

      {/* Main Stage / Participant Grid or List */}
      <div className="voice-room-stage">
        {participantCount > 0 ? (
          isListMode ? (
            <div className="voice-room-user-list" aria-label={voiceStrings?.usersInVoice ?? "Users in voice channel"} role="list">
              {displayParticipants.map((p) => {
                const info = resolveMemberInfo(p.userId);
                const isSpeaking = !info.isSelf && isPeerSpeaking;
                const isMuted = info.isSelf ? callAudioSettings.micMuted : false;
                const peerMedia = !info.isSelf ? callRemoteMedia?.find((m) => m.userId === p.userId) : null;
                const hasVideo = info.isSelf
                  ? Boolean(callAudioSettings.cameraEnabled && localVideoStream)
                  : Boolean(peerMedia?.hasVideo && peerMedia.stream);

                return (
                  <div
                    key={p.userId}
                    className={`voice-participant-list-row${isSpeaking ? " is-speaking" : ""}${info.isSelf ? " is-self" : ""}`}
                    role="listitem"
                  >
                    <div className="voice-list-row-left">
                      <div className="voice-list-avatar-wrap">
                        <RealAvatar
                          accessToken={accessToken}
                          className="avatar voice-list-row-avatar"
                          file={info.profilePhoto}
                          label={info.rawDisplayName}
                        />
                        {isSpeaking && <span className="voice-speaking-ring" aria-hidden="true" />}
                      </div>
                      <span className="voice-list-row-name">{info.displayName}</span>
                      {hasVideo && <span className="voice-list-video-pill" title="Camera Active"><Video size={12} /></span>}
                    </div>
                    <div className="voice-list-row-right">
                      {isMuted && (
                        <span className="voice-list-muted-badge" title={voiceStrings?.muted ?? "Muted"} aria-label={voiceStrings?.muted ?? "Muted"}>
                          <MicOff size={14} aria-hidden="true" />
                        </span>
                      )}
                      <span className="voice-list-row-state">
                        {p.state === "connecting"
                          ? (voiceStrings?.connecting ?? "Connecting…")
                          : isSpeaking
                            ? (voiceStrings?.speaking ?? "Speaking…")
                            : isMuted
                              ? (voiceStrings?.muted ?? "Muted")
                              : (voiceStrings?.connected ?? "Connected")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`voice-room-grid ${gridTierClass}`} aria-label={voiceStrings?.usersInVoice ?? "Users in voice channel"}>
              {displayParticipants.map((p) => {
                const info = resolveMemberInfo(p.userId);
                const isSpeaking = !info.isSelf && isPeerSpeaking;
                const isMuted = info.isSelf ? callAudioSettings.micMuted : false;
                const peerMedia = !info.isSelf ? callRemoteMedia?.find((m) => m.userId === p.userId) : null;
                const hasActiveVideo = info.isSelf
                  ? Boolean(callAudioSettings.cameraEnabled && localVideoStream)
                  : Boolean(peerMedia?.hasVideo && peerMedia.stream);
                const videoStream = info.isSelf ? localVideoStream : peerMedia?.stream ?? null;

                return (
                  <div
                    key={p.userId}
                    className={`voice-participant-card${hasActiveVideo ? " has-video" : ""}${isSpeaking ? " is-speaking" : ""}${info.isSelf ? " is-self" : ""}`}
                  >
                    {hasActiveVideo && videoStream ? (
                      <div className="voice-participant-video-container">
                        <video
                          ref={(el) => {
                            if (el && videoStream && el.srcObject !== videoStream) {
                              el.srcObject = videoStream;
                            }
                          }}
                          autoPlay
                          playsInline
                          muted={info.isSelf}
                          className={`voice-participant-video-feed${info.isSelf && callAudioSettings.mirrorLocalVideo ? " is-mirrored" : ""}`}
                        />
                        {isSpeaking && <span className="voice-video-speaking-border" aria-hidden="true" />}
                        {isMuted && (
                          <span className="voice-card-muted-badge voice-card-muted-badge--video" title={voiceStrings?.muted ?? "Muted"} aria-label={voiceStrings?.muted ?? "Muted"}>
                            <MicOff size={14} aria-hidden="true" />
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className={`voice-participant-avatar-wrapper ${wrapperTierClass}`}>
                        <RealAvatar
                          accessToken={accessToken}
                          className={`avatar voice-participant-avatar ${avatarTierClass}`}
                          file={info.profilePhoto}
                          label={info.rawDisplayName}
                        />
                        {isSpeaking && <span className="voice-speaking-ring" aria-hidden="true" />}
                        {isMuted && (
                          <span className="voice-card-muted-badge" title={voiceStrings?.muted ?? "Muted"} aria-label={voiceStrings?.muted ?? "Muted"}>
                            <MicOff size={14} aria-hidden="true" />
                          </span>
                        )}
                      </div>
                    )}
                    <div className="voice-participant-meta">
                      <span className="voice-participant-name">{info.displayName}</span>
                      <span className="voice-participant-state">
                        {p.state === "connecting"
                          ? (voiceStrings?.connecting ?? "Connecting…")
                          : isSpeaking
                            ? (voiceStrings?.speaking ?? "Speaking…")
                            : isMuted
                              ? (voiceStrings?.muted ?? "Muted")
                              : (voiceStrings?.connected ?? "Connected")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="voice-room-empty-state" data-testid="voice-room-empty-state">
            <div className="voice-room-empty-art">
              <Volume2 size={48} aria-hidden="true" />
            </div>
            <h3>{voiceStrings?.noUsers ?? "No users"}</h3>
            <p>{voiceStrings?.noUsersDescription ?? "No users in this voice channel right now. Join to start talking!"}</p>
          </div>
        )}

        {/* Transcript / AI Notes Side Panel Overlay */}
        {isTranscriptPanelOpen && (
          <TranscriptPanel
            data={transcriptData}
            isLoading={transcriptState === "processing" || transcriptState === "stopping"}
            onClose={toggleTranscriptPanel}
          />
        )}
      </div>

      {/* Bottom Floating/Docked Control Bar */}
      <div className="voice-room-bottom-bar">
        {!isCurrentChannelActive ? (
          <div className="voice-room-prejoin-controls">
            <button
              type="button"
              className="voice-room-primary-join-btn"
              onClick={handleJoin}
              disabled={isConnecting || isAnotherCallActive}
              title={isAnotherCallActive ? (voiceStrings?.callInProgress ?? "Call in progress") : undefined}
            >
              <Volume2 size={20} aria-hidden="true" />
              <span>{isConnecting ? (voiceStrings?.connecting ?? "Connecting…") : isAnotherCallActive ? (voiceStrings?.callInProgress ?? "Call in progress") : (voiceStrings?.joinVoiceChannel ?? "Join Voice Channel")}</span>
            </button>
          </div>
        ) : (
          <div className="voice-room-in-call-controls" role="toolbar" aria-label="Voice Channel Controls">
            <button
              type="button"
              className={`voice-dock-btn${callAudioSettings.micMuted ? " is-muted" : " is-active"}`}
              onClick={handleToggleMic}
              title={callAudioSettings.micMuted ? (voiceStrings?.unmuteMic ?? "Unmute Microphone") : (voiceStrings?.muteMic ?? "Mute Microphone")}
              aria-label={callAudioSettings.micMuted ? (voiceStrings?.unmuteMic ?? "Unmute Microphone") : (voiceStrings?.muteMic ?? "Mute Microphone")}
            >
              {callAudioSettings.micMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            <button
              type="button"
              className={`voice-dock-btn${callAudioSettings.cameraEnabled ? " is-active" : ""}`}
              onClick={handleToggleVideo}
              title={callAudioSettings.cameraEnabled ? (voiceStrings?.turnOffCamera ?? "Turn Off Camera") : (voiceStrings?.turnOnCamera ?? "Turn On Camera")}
              aria-label={callAudioSettings.cameraEnabled ? (voiceStrings?.turnOffCamera ?? "Turn Off Camera") : (voiceStrings?.turnOnCamera ?? "Turn On Camera")}
            >
              {callAudioSettings.cameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </button>

            {/* Screen Demonstration / Share button */}
            <button
              type="button"
              className={`voice-dock-btn${callAudioSettings.screenSharing ? " is-active" : ""}`}
              onClick={handleToggleScreenShare}
              title={callAudioSettings.screenSharing ? (voiceStrings?.stopSharingScreen ?? "Stop Sharing Screen") : (voiceStrings?.shareScreen ?? "Share Screen")}
              aria-label={callAudioSettings.screenSharing ? (voiceStrings?.stopSharingScreen ?? "Stop Sharing Screen") : (voiceStrings?.shareScreen ?? "Share Screen")}
            >
              <Monitor size={20} />
            </button>

            {/* 3 Dots Menu Button for Settings & AI Notes */}
            <div className="voice-more-menu-anchor">
              <button
                ref={moreButtonRef}
                type="button"
                className={`voice-dock-btn${isMoreMenuOpen ? " is-active" : ""}`}
                onClick={() => setIsMoreMenuOpen((open) => !open)}
                title={voiceStrings?.moreOptions ?? "More Options"}
                aria-label={voiceStrings?.moreOptions ?? "More Options"}
                aria-haspopup="true"
                aria-expanded={isMoreMenuOpen}
              >
                <MoreVertical size={20} />
                {transcriptState === "recording" && (
                  <span className="voice-dock-badge-dot" title="AI Notes Recording" />
                )}
              </button>

              {isMoreMenuOpen && (
                <div
                  ref={moreMenuRef}
                  className="voice-more-menu"
                  role="menu"
                  aria-label="More Options Menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="voice-more-menu-item"
                    onClick={handleOpenSettings}
                  >
                    <Settings size={16} aria-hidden="true" />
                    <span>{voiceStrings?.settings ?? "Settings"}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`voice-more-menu-item${transcriptState === "recording" ? " is-recording" : ""}`}
                    onClick={handleToggleAiNotes}
                  >
                    {transcriptState === "recording" ? (
                      <Sparkles size={16} aria-hidden="true" className="voice-icon-spin" />
                    ) : (
                      <FileText size={16} aria-hidden="true" />
                    )}
                    <span>
                      {transcriptState === "recording"
                        ? "Stop AI Notes (Recording…)"
                        : transcriptState === "processing" || transcriptState === "stopping"
                          ? "AI Notes (Processing…)"
                          : transcriptState === "ready"
                            ? "View AI Notes"
                            : "AI Notes"}
                    </span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="voice-dock-btn voice-dock-btn--disconnect"
              onClick={handleLeave}
              title={voiceStrings?.disconnect ?? "Disconnect from Voice Channel"}
              aria-label={voiceStrings?.disconnect ?? "Disconnect from Voice Channel"}
            >
              <PhoneOff size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

