import {
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  Settings,
  Video,
  VideoOff,
  Volume2
} from "lucide-react";

import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import type { CallSessionApi } from "./useCallSession";
import { RealAvatar } from "../sidebar/RealAvatar";

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
  const {
    callPhase,
    activeCallChatId,
    callAudioSettings,
    applyCallAudioPatch,
    toggleScreenShare,
    endActiveCall,
    joinVoiceChannel,
    isPeerSpeaking,
    activeGroupCalls,
    setIsCallSettingsMenuOpen
  } = session;

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
    void applyCallAudioPatch({ cameraEnabled: !callAudioSettings.cameraEnabled });
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

  const resolveMemberInfo = (userId: string) => {
    if (currentUser && userId === currentUser.id) {
      return {
        displayName: currentUser.displayName ? `${currentUser.displayName} (You)` : "You",
        profilePhoto: currentUser.profilePhoto,
        isSelf: true
      };
    }
    const found = chatMembers.find((m) => m.id === userId) || members.find((m) => m.id === userId);
    return {
      displayName: found?.displayName || "Member",
      profilePhoto: found?.profilePhoto || null,
      isSelf: false
    };
  };

  return (
    <div className={`voice-channel-room${isCurrentChannelActive ? " is-connected" : ""}`} role="region" aria-label="Voice Channel Room">
      {/* Main Stage / Participant Grid */}
      <div className="voice-room-stage">
        {displayParticipants.length > 0 ? (
          <div className="voice-room-grid" aria-label="Users in voice channel">
            {displayParticipants.map((p) => {
              const info = resolveMemberInfo(p.userId);
              const isSpeaking = !info.isSelf && isPeerSpeaking;
              const isMuted = info.isSelf ? callAudioSettings.micMuted : false;

              return (
                <div
                  key={p.userId}
                  className={`voice-participant-card${isSpeaking ? " is-speaking" : ""}${info.isSelf ? " is-self" : ""}`}
                >
                  <div className="voice-participant-avatar-wrapper">
                    <RealAvatar
                      accessToken={accessToken}
                      className="voice-participant-avatar"
                      file={info.profilePhoto}
                      label={info.displayName}
                    />
                    {isSpeaking && <span className="voice-speaking-ring" aria-hidden="true" />}
                    {isMuted && (
                      <span className="voice-card-muted-badge" title="Microphone muted">
                        <MicOff size={14} aria-hidden="true" />
                      </span>
                    )}
                  </div>
                  <div className="voice-participant-meta">
                    <span className="voice-participant-name">{info.displayName}</span>
                    <span className="voice-participant-state">
                      {p.state === "connecting"
                        ? "Connecting…"
                        : isSpeaking
                          ? "Speaking…"
                          : isMuted
                            ? "Muted"
                            : "Connected"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="voice-room-empty-state" data-testid="voice-room-empty-state">
            <div className="voice-room-empty-art">
              <Volume2 size={48} aria-hidden="true" />
            </div>
            <h3>No users</h3>
            <p>No users in this voice channel right now. Join to start talking!</p>
          </div>
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
              disabled={isConnecting}
            >
              <Volume2 size={20} aria-hidden="true" />
              <span>{isConnecting ? "Connecting…" : "Join Voice Channel"}</span>
            </button>
          </div>
        ) : (
          <div className="voice-room-in-call-controls" role="toolbar" aria-label="Voice Channel Controls">
            <button
              type="button"
              className={`voice-dock-btn${callAudioSettings.micMuted ? " is-muted" : " is-active"}`}
              onClick={handleToggleMic}
              title={callAudioSettings.micMuted ? "Unmute Microphone" : "Mute Microphone"}
              aria-label={callAudioSettings.micMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {callAudioSettings.micMuted ? <MicOff size={20} /> : <Mic size={20} />}
              <span>{callAudioSettings.micMuted ? "Unmute" : "Mute"}</span>
            </button>

            <button
              type="button"
              className={`voice-dock-btn${callAudioSettings.cameraEnabled ? " is-active" : ""}`}
              onClick={handleToggleVideo}
              title={callAudioSettings.cameraEnabled ? "Turn Off Camera" : "Turn On Camera"}
              aria-label={callAudioSettings.cameraEnabled ? "Turn Off Camera" : "Turn On Camera"}
            >
              {callAudioSettings.cameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              <span>{callAudioSettings.cameraEnabled ? "Camera On" : "Camera"}</span>
            </button>

            <button
              type="button"
              className={`voice-dock-btn${callAudioSettings.screenSharing ? " is-active" : ""}`}
              onClick={handleToggleScreenShare}
              title={callAudioSettings.screenSharing ? "Stop Sharing Screen" : "Share Screen"}
              aria-label={callAudioSettings.screenSharing ? "Stop Sharing Screen" : "Share Screen"}
            >
              <Monitor size={20} />
              <span>Share</span>
            </button>

            <button
              type="button"
              className="voice-dock-btn"
              onClick={() => setIsCallSettingsMenuOpen((open) => !open)}
              title="Audio / Device Settings"
              aria-label="Audio / Device Settings"
            >
              <Settings size={20} />
              <span>Settings</span>
            </button>

            <button
              type="button"
              className="voice-dock-btn voice-dock-btn--disconnect"
              onClick={handleLeave}
              title="Disconnect from Voice Channel"
              aria-label="Disconnect from Voice Channel"
            >
              <PhoneOff size={20} />
              <span>Leave</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
