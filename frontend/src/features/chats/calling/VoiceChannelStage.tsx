import {
  useEffect,
  useRef,
  useState
} from "react";
import {
  MicOff,
  Maximize2,
  Minimize2,
  Settings,
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
import { CallControlButton } from "./CallControlButton";
import { CallDeviceControls } from "./CallDeviceControls";
import { CallParticipantStage } from "./CallParticipantStage";
import { useTranscription } from "./useTranscription";
import { useCallRecording } from "./useCallRecording";
import { useLiveCaptions } from "./useLiveCaptions";
import { LiveCaptionsOverlay } from "./LiveCaptionsOverlay";
import { MeetingIntelligencePopover } from "./MeetingIntelligencePopover";
import { MobileCallMoreMenu } from "./MobileCallMoreMenu";
import IconIntelligence from "../../../components/icons/IconIntelligence";
import { hasLiveLocalVideo } from "../shared/callLifecycle";
import { enableCallCamera } from "./callCamera";
import CallParticipantGrid from "../../../components/CallParticipantGrid";
import { hasScreenSharePresentation } from "./screenSharePresentation";
import { SharedCallStage } from "./SharedCallStage";
import { SharedCallControlPanel } from "./SharedCallControlPanel";
import { useCallUIPreferences } from "./callUIPreferences";

export type VoiceChannelStageProps = {
  chat: Chat;
  session: CallSessionApi;
  members: User[];
  currentUser: User | null;
  accessToken: string | null;
  canAddPeople?: boolean;
  onOpenAddPeople?: () => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
};

export function VoiceChannelStage({
  chat,
  session,
  members,
  currentUser,
  accessToken,
  canAddPeople = false,
  onOpenAddPeople,
  isExpanded = false,
  onToggleExpanded,
}: VoiceChannelStageProps) {
  const strings = useStrings();
  const { preferences: callUIPreferences } = useCallUIPreferences();
  const voiceStrings = strings.chats.voiceRoom;
  const {
    callPhase,
    callType,
    setCallType,
    activeCallChatId,
    callAudioSettings,
    callAudioCapabilities, callAudioDevices,
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

  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false);
  const intelligenceButtonRef = useRef<HTMLButtonElement>(null);
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
    startTranscription,
    stopTranscription,
  } = transcription;

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
  });
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
    if (isCurrentlyActive) {
      void applyCallAudioPatch({ cameraEnabled: false });
      void audioCallRef?.current?.toggleVideo(false);
      return;
    }
    const controller = audioCallRef?.current;
    if (controller && setCallType) void enableCallCamera(controller, setCallType, applyCallAudioPatch);
  };

  const handleToggleScreenShare = () => {
    void toggleScreenShare();
  };

  const handleJoin = () => {
    void joinVoiceChannel(chat, { micMuted: false, cameraEnabled: false });
  };

  const handleLeave = () => {
    void endActiveCall();
  };

  const handleOpenSettings = () => {
    window.dispatchEvent(new CustomEvent("stovo:open-call-settings", { detail: "general" }));
    if (setIsCallAudioPopupOpen) {
      setIsCallAudioPopupOpen(true);
    } else if (setIsCallSettingsMenuOpen) {
      setIsCallSettingsMenuOpen(true);
    }
  };

  const handleToggleNotes = () => {
    if (transcriptState === "idle" || transcriptState === "failed") {
      void startTranscription();
    } else if (transcriptState === "recording") {
      void stopTranscription();
    }
  };

  const handleToggleRecording = () => {
    if (["idle", "completed", "failed"].includes(recording.recordingState)) {
      void recording.startRecording();
    } else if (recording.recordingState === "recording") {
      void recording.stopRecording();
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
  const mockScreenShareOwnerId = isCurrentChannelActive ? session.mockScreenShareUserId : null;
  const hasActiveScreenShare = hasScreenSharePresentation(mockScreenShareOwnerId, localScreenStream, callRemoteMedia);
  const mockScreenShareOwner = mockScreenShareOwnerId ? { userId: mockScreenShareOwnerId, displayName: resolveMemberInfo(mockScreenShareOwnerId).rawDisplayName } : null;

  return (
    <div className={`voice-channel-room${isCurrentChannelActive ? " is-connected" : ""}`} role="region" aria-label="Voice Channel Room">
      <LiveCaptionsOverlay
        isCaptionsEnabled={liveCaptions.isCaptionsEnabled}
        recentCaptions={liveCaptions.recentCaptions}
        currentInterimCaption={liveCaptions.currentInterimCaption}
        speakerDisplayName={currentUser?.displayName ?? "You"}
      />
      {participantCount > 0 && onToggleExpanded && (
        <button
          type="button"
          className="voice-room-expand-button"
          onClick={onToggleExpanded}
          aria-label={isExpanded ? voiceStrings?.shrinkCall ?? "Shrink Voice Channel" : voiceStrings?.expandCall ?? "Expand Voice Channel"}
          aria-pressed={isExpanded}
          title={isExpanded ? voiceStrings?.shrinkCall ?? "Shrink Voice Channel" : voiceStrings?.expandCall ?? "Expand Voice Channel"}
        >
          {isExpanded ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
        </button>
      )}
      {/* Main Stage / Participant Grid or List */}
      <SharedCallStage cameraFit={callUIPreferences.cameraFit} isSharing={hasActiveScreenShare} className="voice-room-stage">
        <div className={participantCount === 0 ? "voice-room-empty-content" : "voice-room-participant-content"}>
          {hasActiveScreenShare ? (
          <CallParticipantGrid
            localStream={localVideoStream}
            localScreenStream={localScreenStream}
            remoteMedia={callRemoteMedia ?? []}
            mockScreenShareOwner={mockScreenShareOwner}
            localUserLabel={currentUser?.displayName ?? "You"}
            mirrorLocal={Boolean(callAudioSettings.mirrorLocalVideo)}
            callType={callType}
            isLocalSpeaking={isLocalSpeaking}
            isLocalMuted={callAudioSettings.micMuted}
            isPeerSpeaking={isPeerSpeaking}
            speakingUserIds={speakingUserIds}
            onFlipLocalCamera={callAudioSettings.cameraEnabled && hasLiveLocalVideo(localVideoStream)
              ? () => void applyCallAudioPatch({ cameraFacingMode: callAudioSettings.cameraFacingMode === "user" ? "environment" : "user" })
              : undefined}
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
                          className={`voice-participant-video-feed${hasScreenShare ? " is-screen-share" : ""}${info.isSelf && !hasScreenShare && callAudioSettings.mirrorLocalVideo ? " is-mirrored" : ""}`}
                        />
                        {info.isSelf && !hasScreenShare && callAudioSettings.cameraEnabled && hasLiveLocalVideo(localVideoStream) && (
                          <CallControlButton
                            action="flip-camera"
                            label="Flip camera"
                            state="idle"
                            iconSize={16}
                            className="call-grid__flip-camera voice-channel-flip-camera"
                            onClick={() => void applyCallAudioPatch({ cameraFacingMode: callAudioSettings.cameraFacingMode === "user" ? "environment" : "user" })}
                          />
                        )}
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

        </div>
      </SharedCallStage>

      {participantCount > 0 && canAddPeople && onOpenAddPeople && (
        <button
          type="button"
          className="voice-room-member-invite"
          onClick={onOpenAddPeople}
          aria-label={strings.chats.details.addPeople}
          title={strings.chats.details.addPeople}
        >
          <UserPlus aria-hidden="true" size={18} />
        </button>
      )}

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
          <SharedCallControlPanel autoHide={callUIPreferences.autoHideControls}>
          <div className="voice-room-in-call-controls guest-call-controls shared-call-controls" role="toolbar" aria-label="Voice Channel Controls">
            <CallDeviceControls settings={callAudioSettings} devices={callAudioDevices} capabilities={callAudioCapabilities} controlClassName="voice-dock-btn" labels={{ microphone: voiceStrings?.microphone, speaker: voiceStrings?.speaker, camera: voiceStrings?.camera }} toggleLabels={{ microphone: callAudioSettings.micMuted ? (voiceStrings?.unmuteMic ?? "Unmute Microphone") : (voiceStrings?.muteMic ?? "Mute Microphone"), camera: callAudioSettings.cameraEnabled ? (voiceStrings?.turnOffCamera ?? "Turn Off Camera") : (voiceStrings?.turnOnCamera ?? "Turn On Camera") }} deviceStrings={voiceStrings} onPatch={(patch) => void applyCallAudioPatch(patch)} onToggleCamera={handleToggleVideo} />

            {/* Screen sharing and secondary call actions live in the mobile More menu. */}
            <CallControlButton action="screen-share" state={callAudioSettings.screenSharing ? "active" : "idle"} className="voice-dock-btn voice-room-desktop-action" onClick={handleToggleScreenShare} label={callAudioSettings.screenSharing ? (voiceStrings?.stopSharingScreen ?? "Stop Sharing Screen") : (voiceStrings?.shareScreen ?? "Share Screen")} />

            {/* Stovo Intelligence Popover Button */}
            <div className="voice-more-menu-anchor voice-room-desktop-action">
              <button
                ref={intelligenceButtonRef}
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
                anchorElement={intelligenceButtonRef.current}
                notesState={transcriptState}
                onToggleNotes={handleToggleNotes}
                isNotesAllowed={true}
                recordingState={recording.recordingState}
                recordingTimer={recording.recordingTimer}
                onToggleRecording={handleToggleRecording}
                isRecordingAllowed={true}
                isCaptionsEnabled={liveCaptions.isCaptionsEnabled}
                onToggleCaptions={liveCaptions.toggleCaptions}
              />
            </div>

            <div className="voice-more-menu-anchor voice-room-desktop-action">
              <button
                type="button"
                className="voice-dock-btn"
                onClick={handleOpenSettings}
                title={voiceStrings?.settings ?? "Settings"}
                aria-label={voiceStrings?.settings ?? "Settings"}
              >
                <Settings size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="voice-room-mobile-more">
              <MobileCallMoreMenu
                isSharing={callAudioSettings.screenSharing}
                onOpenSettings={handleOpenSettings}
                onToggleScreenShare={handleToggleScreenShare}
              >
                <CallControlButton
                  action="audio-output"
                  toggle
                  state={callAudioSettings.speakerMode === "large" ? "active" : "idle"}
                  label={callAudioSettings.speakerMode === "large" ? "Use earpiece" : "Use speaker"}
                  onClick={() => void applyCallAudioPatch({ speakerMode: callAudioSettings.speakerMode === "small" ? "large" : "small" })}
                >
                  <span>{callAudioSettings.speakerMode === "large" ? "Use earpiece" : "Use speaker"}</span>
                </CallControlButton>
                <MeetingIntelligencePopover
                  isOpen
                  onClose={() => undefined}
                  notesState={transcriptState}
                  onToggleNotes={handleToggleNotes}
                  isNotesAllowed
                  recordingState={recording.recordingState}
                  recordingTimer={recording.recordingTimer}
                  onToggleRecording={handleToggleRecording}
                  isRecordingAllowed
                  isCaptionsEnabled={liveCaptions.isCaptionsEnabled}
                  onToggleCaptions={liveCaptions.toggleCaptions}
                  isMobile
                  inlineMenu
                />
              </MobileCallMoreMenu>
            </div>

            <CallControlButton action="end-call" state="idle" className="voice-dock-btn voice-dock-btn--disconnect" onClick={handleLeave} title={voiceStrings?.disconnect ?? "Disconnect from Voice Channel"} label={voiceStrings?.disconnect ?? "Disconnect from Voice Channel"} />
          </div>
          </SharedCallControlPanel>
        )}
      </div>
    </div>
  );
}
