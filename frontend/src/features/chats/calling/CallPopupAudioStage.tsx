import { MicOff } from "lucide-react";
import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import { RealAvatar } from "../sidebar/RealAvatar";
import { useCallFeatureContext } from "./CallFeatureContext";

type CallPopupAudioStageProps = { activeChat: Chat | null };
type GroupParticipant = { userId: string; state?: string };

export function CallPopupAudioStage({ activeChat }: CallPopupAudioStageProps) {
  const { session, members, currentUser, isMobileViewport } = useCallFeatureContext();
  const {
    callPhase,
    callType,
    isCallMinimized,
    hasRemoteVideo,
    callRemoteMedia,
    callAudioSettings,
    callPeerUserId,
    callPeerDisplayName,
    activeCallPeerName,
    isPeerSpeaking,
    isLocalSpeaking,
    speakingUserIds,
    callParticipantIds,
    activeGroupCalls,
    accessToken,
  } = session;

  const hasScreenShare = callRemoteMedia.some((media) => media.hasScreenShare);
  if (
    isCallMinimized ||
    (callType !== "audio" && callAudioSettings.cameraEnabled) ||
    hasRemoteVideo ||
    hasScreenShare || callAudioSettings.screenSharing || session.localScreenStream ||
    callPhase !== "in-call" ||
    isMobileViewport
  ) return null;

  const activePeer = members.find((member) => member.id === callPeerUserId) ||
    activeChat?.members?.find((member) => member.id === callPeerUserId) ||
    activeChat?.members?.find((member) => member.id !== currentUser?.id);
  const isGroupCall = activeChat?.type === "group" || activeChat?.type === "family";

  if (isGroupCall) {
    const activeCall = activeGroupCalls[activeChat.id] ?? activeChat.activeCall;
    const activeParticipants = (activeCall?.participants ?? []) as GroupParticipant[];
    const participantIds = Array.from(new Set([
      ...activeParticipants
        .filter((participant) => ["connected", "connecting", "in-call"].includes(participant.state ?? ""))
        .map((participant) => participant.userId),
      ...callParticipantIds,
      callPeerUserId,
      currentUser?.id,
    ].filter((userId): userId is string => Boolean(userId))));
    const gridTier = participantIds.length === 1
      ? "1"
      : participantIds.length === 2
      ? "2"
      : participantIds.length <= 4
      ? "4"
      : participantIds.length <= 6
      ? "6"
      : "9";

    return (
      <div className={`call-popup-group-participants shared-call-stage voice-room-grid voice-grid--${gridTier}`} role="list" aria-label="Group call participants">
        {participantIds.map((userId) => {
          const isSelf = userId === currentUser?.id;
          const member = members.find((candidate) => candidate.id === userId) ??
            activeChat.members.find((candidate) => candidate.id === userId);
          const participantState = activeParticipants.find((participant) => participant.userId === userId)?.state;
          const isSpeaking = isSelf
            ? isLocalSpeaking
            : Boolean(speakingUserIds.includes(userId) || (isPeerSpeaking && participantIds.length <= 2));
          const isMuted = isSelf && callAudioSettings.micMuted;
          const displayName = isSelf ? `${currentUser?.displayName ?? "You"} (You)` : member?.displayName ?? "Member";
          const stateLabel = participantState === "connecting"
            ? "Connecting…"
            : isSpeaking
            ? "Speaking…"
            : isMuted
            ? "Muted"
            : "Connected";

          return (
            <div key={userId} className={`voice-participant-card call-popup-group-participant${isSpeaking ? " is-speaking" : ""}${isSelf ? " is-self" : ""}`} role="listitem">
              <div className="voice-participant-avatar-wrapper voice-avatar-wrapper--md">
                <RealAvatar
                  accessToken={accessToken ?? null}
                  className="avatar voice-participant-avatar voice-avatar--md"
                  file={member?.profilePhoto ?? null}
                  label={member?.displayName ?? (isSelf ? currentUser?.displayName ?? "You" : "Member")}
                />
                {isMuted && <span className="voice-card-muted-badge" aria-label="Muted"><MicOff size={14} aria-hidden="true" /></span>}
              </div>
              <div className="voice-participant-meta">
                <span className="voice-participant-name">{displayName}</span>
                <span className="voice-participant-state" role="status">{stateLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`call-popup-avatar-area${isPeerSpeaking ? " is-speaking" : ""}`}>
      <div className="call-popup-avatar-circle">
        <RealAvatar
          accessToken={accessToken ?? null}
          className="avatar call-popup-real-avatar"
          file={activePeer?.profilePhoto ?? null}
          label={callPeerDisplayName ?? activeCallPeerName ?? "Call"}
        />
        <div className={`call-popup-avatar-ring${isPeerSpeaking ? "" : " silent"}`} />
        <div className={`call-popup-avatar-ring${isPeerSpeaking ? "" : " silent"}`} />
      </div>
      <div className="call-popup-waveform">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className={`call-popup-wave-bar${isPeerSpeaking ? "" : " silent"}`} />
        ))}
      </div>
    </div>
  );
}
