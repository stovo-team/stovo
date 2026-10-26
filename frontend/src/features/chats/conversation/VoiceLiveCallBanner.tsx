import type { User } from "../../../api/auth";
import type { Chat } from "../../../api/chats";
import { useStrings } from "../../../i18n/LanguageContext";
import type { CallSessionApi } from "../calling/useCallSession";
import { RealAvatar } from "../sidebar/RealAvatar";

export function VoiceLiveCallBanner({
  chat,
  session,
  isActive,
  members,
  currentUser,
  accessToken,
}: {
  chat: Chat;
  session?: CallSessionApi;
  isActive: boolean;
  members: User[];
  currentUser: User | null;
  accessToken: string | null;
}) {
  const strings = useStrings();
  const activeCall = chat.activeCall ?? (isActive
    ? { participants: session?.callParticipantIds?.map((userId) => ({ userId, state: "connected" })) }
    : null);
  if (!activeCall) return null;

  const ids = Array.from(new Set([
    ...(((activeCall.participants as Array<{ userId?: string; state?: string }> | undefined) ?? [])
      .filter((participant) => participant.userId && ["connected", "connecting", "in-call"].includes(participant.state ?? ""))
      .map((participant) => participant.userId as string)),
    ...(isActive ? session?.callParticipantIds ?? [] : []),
    ...(isActive && currentUser?.id ? [currentUser.id] : []),
  ]));

  return (
    <div className="voice-live-call-banner" role="status">
      <span className="voice-live-call-avatars" aria-label={strings.meetings.guest.activeCallMembers(ids.length)}>
        {ids.slice(0, 5).map((userId) => {
          const user = members.find((member) => member.id === userId);
          return (
            <RealAvatar
              key={userId}
              accessToken={accessToken}
              className="avatar voice-live-call-avatar"
              file={user?.profilePhoto}
              label={user?.displayName ?? strings.chats.sidebar.member}
              entityId={userId}
              mode={user?.avatarMode}
              symbolId={user?.avatarSymbolId}
              colorId={user?.avatarColorId}
            />
          );
        })}
      </span>
      <strong>{strings.chats.voiceRoom.callInProgress}</strong>
      {ids.length > 5 && <small>+{ids.length - 5}</small>}
    </div>
  );
}
