import React from "react";
import { Mic, MicOff, Monitor, PhoneOff, Video, VideoOff, Volume2 } from "lucide-react";

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
    activeGroupCalls
  } = session;

  const isCurrentChannelActive = activeCallChatId === chat.id && callPhase !== "idle";
  const activeCall = activeGroupCalls[chat.id] || chat.activeCall;
  const rawParticipants = (activeCall?.participants as Array<Record<string, any>>) || [];
  const activeParticipants = rawParticipants.filter(
    (p) => p.state === "connected" || p.state === "connecting" || p.state === "in-call"
  );

  const participantCount = isCurrentChannelActive
    ? Math.max(activeParticipants.length, 1)
    : activeParticipants.length;

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

  return (
    <div className={`voice-channel-stage${isCurrentChannelActive ? " is-connected" : ""}`} role="region" aria-label="Voice Channel Stage">
      <div className="voice-channel-stage-header">
        <div className="voice-channel-stage-title-group">
          <div className="voice-channel-live-badge">
            <span className="voice-channel-pulse-dot" aria-hidden="true" />
            <Volume2 size={16} aria-hidden="true" />
            <span>{isCurrentChannelActive ? "Connected to Voice" : "Voice Channel"}</span>
          </div>
          <span className="voice-channel-member-count">
            {participantCount === 0
              ? "No one here yet"
              : `${participantCount} member${participantCount === 1 ? "" : "s"} inside`}
          </span>
        </div>

        {!isCurrentChannelActive ? (
          <button
            type="button"
            className="voice-channel-join-btn"
            onClick={handleJoin}
            aria-label="Join voice channel"
          >
            <Volume2 size={18} aria-hidden="true" />
            <span>Join Voice</span>
          </button>
        ) : (
          <div className="voice-channel-controls">
            <button
              type="button"
              className={`voice-stage-control-btn${callAudioSettings.micMuted ? " is-off" : ""}`}
              onClick={handleToggleMic}
              title={callAudioSettings.micMuted ? "Unmute microphone" : "Mute microphone"}
              aria-label={callAudioSettings.micMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {callAudioSettings.micMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              type="button"
              className={`voice-stage-control-btn${!callAudioSettings.cameraEnabled ? " is-off" : ""}`}
              onClick={handleToggleVideo}
              title={callAudioSettings.cameraEnabled ? "Turn off camera" : "Turn on camera"}
              aria-label={callAudioSettings.cameraEnabled ? "Turn off camera" : "Turn on camera"}
            >
              {callAudioSettings.cameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button
              type="button"
              className={`voice-stage-control-btn${callAudioSettings.screenSharing ? " is-active" : ""}`}
              onClick={handleToggleScreenShare}
              title="Share screen"
              aria-label="Share screen"
            >
              <Monitor size={18} />
            </button>
            <button
              type="button"
              className="voice-stage-control-btn voice-stage-control-btn--leave"
              onClick={handleLeave}
              title="Leave voice channel"
              aria-label="Leave voice channel"
            >
              <PhoneOff size={18} />
              <span>Leave</span>
            </button>
          </div>
        )}
      </div>

      {participantCount > 0 && (
        <div className="voice-channel-participants-strip">
          {activeParticipants.map((p) => {
            const member = members.find((m) => m.id === p.userId);
            const isLocal = p.userId === currentUser?.id;
            const displayName = isLocal ? "You" : member?.displayName || "Member";
            const isSpeaking = !isLocal && isPeerSpeaking;

            return (
              <div
                key={p.userId}
                className={`voice-channel-participant-chip${isSpeaking ? " is-speaking" : ""}`}
                title={displayName}
              >
                <RealAvatar
                  accessToken={accessToken}
                  className="avatar chat-avatar"
                  file={member?.profilePhoto ?? null}
                  label={displayName}
                />
                <span className="voice-participant-name">{displayName}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
