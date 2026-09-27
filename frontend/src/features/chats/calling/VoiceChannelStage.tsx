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
  MoreVertical,
  PhoneOff,
  Settings,
  ScreenShare,
  ScreenShareOff,
  Square,
  UserPlus,
  Video,
  VideoOff,
  Volume2
} from "lucide-react";

import { useStrings } from "../../../i18n/LanguageContext";
import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import type { CallSessionApi } from "./useCallSession";
import { RealAvatar } from "../sidebar/RealAvatar";
import { SpeakingWaveBadge } from "./SpeakingWaveBadge";
import { useTranscription } from "./useTranscription";
import { useCallRecording } from "./useCallRecording";
import { useLiveCaptions } from "./useLiveCaptions";
import { LiveCaptionsOverlay } from "./LiveCaptionsOverlay";
import { MeetingBackgroundToast, MeetingIntelligencePopover } from "./MeetingIntelligencePopover";
import IconIntelligence from "../../../components/icons/IconIntelligence";
import { hasLiveLocalVideo } from "../shared/callLifecycle";
import CallParticipantGrid from "../../../components/CallParticipantGrid";

export type VoiceChannelStageProps = {
  chat: Chat;
  session: CallSessionApi;
  members: User[];
  currentUser: User | null;
  accessToken: string | null;
  canAddPeople?: boolean;
  onOpenAddPeople?: () => void;
};

export function VoiceChannelStage({
  chat,
  session,
  members,
  currentUser,
  accessToken,
  canAddPeople = false,
  onOpenAddPeople,
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
    isLocalSpeaking,
    speakingUserIds,
    activeGroupCalls,
    setIsCallSettingsMenuOpen,
    setIsCallAudioPopupOpen,
    setIsCallMinimized,
    callRoomId,
    socketRef,
    localVideoStream,
    localScreenStream,
    audioCallRef
  } = session;

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false);
  const [isAiNotesQueuedToastVisible, setIsAiNotesQueuedToastVisible] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const fallbackSocketRef = useRef(null);

  const effectiveRoomId = callRoomId ?? (chat.activeCall?.roomId ?? null);
  const effectiveAccessToken = accessToken ?? session.accessToken ?? null;
  const isCurrentChannelActive = activeCallChatId === chat.id && callPhase !== "idle";

  const transcription = useTranscription({
    accessToken: effectiveAccessToken,
    roomId: effectiveRoomId,
    currentUserId: currentUser?.id ?? null,
    socketRef: socketRef ?? session.socketRef ?? fallbackSocketRef,
    localAudioStream: audioCallRef?.current?.getLocalStream?.() ?? localVideoStream ?? session.localVideoStream,
    enabled: true,
  });

  const {
    transcriptState,
    transcriptError,
    startTranscription,
    stopTranscription,
  } = transcription;

  useEffect(() => {
    if (!isAiNotesQueuedToastVisible) return;
    const timer = window.setTimeout(() => setIsAiNotesQueuedToastVisible(false), 5_000);
    return () => window.clearTimeout(timer);
  }, [isAiNotesQueuedToastVisible]);

  const recording = useCallRecording({
    accessToken: effectiveAccessToken,
    roomId: effectiveRoomId,
    socketRef: socketRef ?? session.socketRef ?? fallbackSocketRef,
    localStream: audioCallRef?.current?.getLocalStream?.() ?? localVideoStream ?? session.localVideoStream,
    localScreenStream: localScreenStream ?? session.localScreenStream,
    remoteStreams: callRemoteMedia?.map((m) => ({ cameraStream: m.stream, screenStream: null })) ?? [],
    enabled: isCurrentChannelActive,
  });

  const liveCaptions = useLiveCaptions({
    accessToken: effectiveAccessToken,
    roomId: effectiveRoomId,
    localAudioStream: audioCallRef?.current?.getLocalStream?.() ?? localVideoStream ?? session.localVideoStream,
    displayName: currentUser?.displayName ?? "You",
    defaultLanguage: "en",
  });
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

  const isConnecting = activeCallChatId === chat.id && callPhase === "connecting";
  const activeCall = activeGroupCalls[chat.id] || chat.activeCall;
  const rawParticipants = (activeCall?.participants as Array<{ userId: string; state: string; role: string }>) || [];
  
  // Active participants currently in the room
  const activeParticipants = rawParticipants.filter(
    (p) =>
      (p.state === "connected" || p.state === "connecting" || p.state === "in-call") &&
      // Chat snapshots can briefly retain the local participant after Leave.
      // Never present that cached entry as an active user once our session ended.
      (isCurrentChannelActive || p.userId !== currentUser?.id)
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
    }
  };

  const aiNotesStatus = transcriptError
    ? `AI Notes failed: ${transcriptError}`
    : transcriptState === "starting"
      ? "Starting AI Notes…"
      : transcriptState === "recording"
        ? "AI Notes is on. It will stop automatically when the call ends."
        : null;
  const visibleNotice = transcriptError ? aiNotesStatus : callNotice && /failed|failure|error|denied|unsupported|not supported|timed out|offline|could not|unable|not available/i.test(callNotice) ? callNotice : null;

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
  const hasActiveScreenShare = Boolean(
    localScreenStream?.getVideoTracks().some((track) => track.readyState !== "ended") ||
    callRemoteMedia?.some(
      (media) => media.hasScreenShare && media.screenStream?.getVideoTracks().some((track) => track.readyState !== "ended"),
    ),
  );

  return (
    <div className={`voice-channel-room${isCurrentChannelActive ? " is-connected" : ""}`} role="region" aria-label="Voice Channel Room">
      <MeetingBackgroundToast visible={isAiNotesQueuedToastVisible} />
      <LiveCaptionsOverlay
        isCaptionsEnabled={liveCaptions.isCaptionsEnabled}
        recentCaptions={liveCaptions.recentCaptions}
        currentInterimCaption={liveCaptions.currentInterimCaption}
        targetLanguage={liveCaptions.targetLanguage}
        speakerDisplayName={currentUser?.displayName ?? "You"}
      />
      {/* Notice Banner */}
      {visibleNotice && (
        <div
          className="voice-room-notice-banner"
          role={transcriptError ? "alert" : "status"}
          aria-live="polite"
          data-testid="voice-ai-notes-status"
        >
          <span>{visibleNotice}</span>
        </div>
      )}
      {/* Main Stage / Participant Grid or List */}
      <div className="voice-room-stage">
        <div className={participantCount === 0 ? "voice-room-empty-content" : "voice-room-participant-content"}>
          {hasActiveScreenShare ? (
          <CallParticipantGrid
            localStream={localVideoStream}
            localScreenStream={localScreenStream}
            remoteMedia={callRemoteMedia ?? []}
            localUserLabel={currentUser?.displayName ?? "You"}
            mirrorLocal={Boolean(callAudioSettings.mirrorLocalVideo)}
            callType={callType}
            isLocalSpeaking={isLocalSpeaking}
            isPeerSpeaking={isPeerSpeaking}
            speakingUserIds={speakingUserIds}
          />
        ) : participantCount > 0 ? (
          isListMode ? (
            <div className="voice-room-user-list" aria-label={voiceStrings?.usersInVoice ?? "Users in voice channel"} role="list">
              {displayParticipants.map((p) => {
                const info = resolveMemberInfo(p.userId);
                const isSpeaking = info.isSelf
                  ? Boolean(isLocalSpeaking)
                  : Boolean(speakingUserIds?.includes(p.userId) || (isPeerSpeaking && participantCount <= 2));
                const isMuted = info.isSelf ? callAudioSettings.micMuted : false;
                const peerMedia = !info.isSelf ? callRemoteMedia?.find((m) => m.userId === p.userId) : null;
                const screenStream = info.isSelf ? localScreenStream : peerMedia?.screenStream ?? null;
                const hasScreenShare = Boolean(
                  screenStream?.getVideoTracks().some((track) => track.readyState !== "ended")
                );
                const hasVideo = info.isSelf
                  ? hasScreenShare || Boolean(callAudioSettings.cameraEnabled && localVideoStream)
                  : hasScreenShare || Boolean(peerMedia?.hasVideo && peerMedia.stream);

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
                      {hasVideo && <span className="voice-list-video-pill" title={hasScreenShare ? "Screen Sharing" : "Camera Active"}><Video size={12} /></span>}
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
                const isSpeaking = info.isSelf
                  ? Boolean(isLocalSpeaking)
                  : Boolean(speakingUserIds?.includes(p.userId) || (isPeerSpeaking && participantCount <= 2));
                const isMuted = info.isSelf ? callAudioSettings.micMuted : false;
                const peerMedia = !info.isSelf ? callRemoteMedia?.find((m) => m.userId === p.userId) : null;
                const screenStream = info.isSelf ? localScreenStream : peerMedia?.screenStream ?? null;
                const hasScreenShare = Boolean(
                  screenStream?.getVideoTracks().some((track) => track.readyState !== "ended")
                );
                const hasActiveVideo = info.isSelf
                  ? hasScreenShare || Boolean(callAudioSettings.cameraEnabled && localVideoStream)
                  : hasScreenShare || Boolean(peerMedia?.hasVideo && peerMedia.stream);
                const videoStream = hasScreenShare
                  ? screenStream
                  : (info.isSelf ? localVideoStream : peerMedia?.stream ?? null);

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
                          className={`voice-participant-video-feed${info.isSelf && !hasScreenShare && callAudioSettings.mirrorLocalVideo ? " is-mirrored" : ""}`}
                        />
                        {isSpeaking && <SpeakingWaveBadge />}
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

        {canAddPeople && onOpenAddPeople && (
          <button
            type="button"
            className="voice-room-member-invite"
            onClick={onOpenAddPeople}
          >
            <UserPlus aria-hidden="true" size={18} />
            <span>{strings.chats.details.addPeople}</span>
          </button>
        )}
        </div>
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
              {callAudioSettings.screenSharing ? <ScreenShare size={20} /> : <ScreenShareOff size={20} />}
            </button>

            {/* Stovo Intelligence Popover Button */}
            <div className="voice-more-menu-anchor">
              <button
                type="button"
                className={`voice-dock-btn voice-dock-btn--intel${
                  isIntelligenceOpen || recording.isRecordingActive || transcriptState === "recording" ? " is-active" : ""
                }`}
                onClick={() => setIsIntelligenceOpen((open) => !open)}
                title="Stovo Intelligence (Notes, Recording, Captions)"
                aria-label="Stovo Intelligence"
                aria-haspopup="true"
                aria-expanded={isIntelligenceOpen}
              >
                <IconIntelligence size={20} />
                {(recording.isRecordingActive || transcriptState === "recording") && (
                  <span className="voice-dock-badge-dot" title="Intelligence Active" />
                )}
              </button>

              <MeetingIntelligencePopover
                isOpen={isIntelligenceOpen}
                onClose={() => setIsIntelligenceOpen(false)}
                notesState={transcriptState}
                onToggleNotes={() => {
                  if (transcriptState === "idle" || transcriptState === "failed") {
                    void startTranscription();
                  } else if (transcriptState === "recording") {
                    setIsIntelligenceOpen(false);
                    setIsAiNotesQueuedToastVisible(true);
                    void stopTranscription();
                  }
                }}
                isNotesAllowed={true}
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
                    disabled={transcriptState === "starting" || transcriptState === "stopping" || transcriptState === "processing" || transcriptState === "ready"}
                  >
                    {transcriptState === "recording" ? (
                      <Square size={16} aria-hidden="true" fill="currentColor" />
                    ) : (
                      <FileText size={16} aria-hidden="true" />
                    )}
                    <span>
                      {transcriptState === "recording"
                        ? "Stop AI Notes"
                        : transcriptState === "processing" || transcriptState === "stopping"
                          ? "AI Notes (Processing…)"
                          : transcriptState === "ready"
                            ? "AI Notes (Will post in chat)"
                            : transcriptState === "failed"
                              ? "Retry AI Notes"
                              : "Start AI Notes"}
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
