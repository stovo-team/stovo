import type { ReactNode } from "react";
import { Clock3, ChevronRight, LockKeyhole, Mail, UserPlus, UsersRound, UserRound, UserRoundX, Volume2 } from "lucide-react";
import type { AppStrings } from "../../config/strings";
import type { User } from "../../api/auth";

export type PrivacyDetail = "overview" | "profile" | "lastSeen" | "blocked" | "directMessages" | "groupInvites" | "channelInvites" | "voiceInvites";

interface PrivacySecuritySettingsProps {
  strings: AppStrings;
  currentUser: User | null;
  members: User[];
  blockedMemberIds: string[];
  detail: PrivacyDetail;
  isSaving: boolean;
  appLockEnabled: boolean;
  canUseAppLock: boolean;
  onDetailChange: (detail: PrivacyDetail) => void;
  onUpdatePrivacy: (patch: Partial<Pick<User, "profileVisibility" | "lastSeenVisibility" | "readReceiptsEnabled" | "directMessagePermission" | "groupInvitePermission" | "channelInvitePermission" | "voiceInvitePermission" | "invitePermissionUserIds">>) => void;
  onAppLockChange: (enabled: boolean) => void;
  onToggleBlock: (member: User) => void;
  renderMemberAvatar: (member: User) => ReactNode;
}

export function PrivacySecuritySettings({
  strings,
  currentUser,
  members,
  blockedMemberIds,
  detail,
  isSaving,
  appLockEnabled,
  canUseAppLock,
  onDetailChange,
  onUpdatePrivacy,
  onAppLockChange,
  onToggleBlock,
  renderMemberAvatar
}: PrivacySecuritySettingsProps) {
  if (detail === "overview") {
    return (
      <div className="settings-toggle-groups">
        <button type="button" className="privacy-row" onClick={() => onDetailChange("profile")}>
          <UserRound aria-hidden="true" />
          <span>
            <strong>{strings.privacy.profileVisibility}</strong>
            <small>{currentUser?.profileVisibility === "nobody" ? strings.privacy.nobody : strings.privacy.family}</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button type="button" className="privacy-row" onClick={() => onDetailChange("lastSeen")}>
          <Clock3 aria-hidden="true" />
          <span>
            <strong>{strings.privacy.lastSeen}</strong>
            <small>{currentUser?.lastSeenVisibility === "nobody" ? strings.privacy.nobody : strings.privacy.family}</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
        <label className="privacy-row">
          <Mail aria-hidden="true" />
          <span>
            <strong>{strings.privacy.readReceipts}</strong>
            <small>{strings.privacy.readReceiptsHelp}</small>
          </span>
          <input type="checkbox" checked={currentUser?.readReceiptsEnabled ?? true} disabled={isSaving} onChange={(event) => onUpdatePrivacy({ readReceiptsEnabled: event.target.checked })} />
        </label>
        <button type="button" className="privacy-row" onClick={() => onDetailChange("directMessages")}>
          <Mail aria-hidden="true" />
          <span><strong>Direct messages</strong><small>{currentUser?.directMessagePermission === "nobody" ? strings.privacy.nobody : currentUser?.directMessagePermission === "selected" ? "Selected people" : strings.privacy.family}</small></span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button type="button" className="privacy-row" onClick={() => onDetailChange("groupInvites")}>
          <UsersRound aria-hidden="true" />
          <span><strong>Group invitations</strong><small>{inviteSummary(currentUser?.groupInvitePermission)}</small></span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button type="button" className="privacy-row" onClick={() => onDetailChange("channelInvites")}>
          <UserPlus aria-hidden="true" />
          <span><strong>Channel invitations</strong><small>{inviteSummary(currentUser?.channelInvitePermission)}</small></span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button type="button" className="privacy-row" onClick={() => onDetailChange("voiceInvites")}>
          <Volume2 aria-hidden="true" />
          <span><strong>Voice-channel invitations</strong><small>{inviteSummary(currentUser?.voiceInvitePermission)}</small></span>
          <ChevronRight aria-hidden="true" />
        </button>
        {canUseAppLock && (
          <label className="privacy-row">
            <LockKeyhole aria-hidden="true" />
            <span>
              <strong>{strings.privacy.appLock}</strong>
              <small>{appLockEnabled ? strings.privacy.appLockOn : strings.privacy.appLockOff}</small>
            </span>
            <input type="checkbox" checked={appLockEnabled} disabled={isSaving} onChange={(event) => onAppLockChange(event.target.checked)} />
          </label>
        )}
        <button type="button" className="privacy-row" onClick={() => onDetailChange("blocked")}>
          <UserRoundX aria-hidden="true" />
          <span><strong>{strings.privacy.blockedMembers}</strong></span>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="settings-toggle-groups">
      {detail === "blocked" ? (
        <section className="blocked-members-page">
          <h3>{strings.privacy.blockedMembers}</h3>
          {members.filter((member) => member.id !== currentUser?.id).map((member) => {
            const isBlocked = blockedMemberIds.includes(member.id);
            return (
              <div className="settings-row" key={member.id}>
                {renderMemberAvatar(member)}
                <span><strong>{member.displayName}</strong><small>@{member.username}</small></span>
                <button type="button" className="blocked-member-action" disabled={isSaving} onClick={() => onToggleBlock(member)}>
                  {isBlocked ? strings.privacy.unblock : strings.privacy.block}
                </button>
              </div>
            );
          })}
        </section>
      ) : detail === "directMessages" || detail === "groupInvites" || detail === "channelInvites" || detail === "voiceInvites" ? (
        <PrivacyContactRule detail={detail} currentUser={currentUser} members={members} isSaving={isSaving} onUpdatePrivacy={onUpdatePrivacy} />
      ) : (
        <section className="choice-page">
          <h3>{detail === "profile" ? strings.privacy.profileVisibility : strings.privacy.lastSeen}</h3>
          {(["family", "nobody"] as const).map((value) => {
            const selected = (detail === "profile" ? currentUser?.profileVisibility : currentUser?.lastSeenVisibility) === value;
            return (
              <button type="button" className={`privacy-choice${selected ? " is-selected" : ""}`} key={value} onClick={() => onUpdatePrivacy(detail === "profile" ? { profileVisibility: value } : { lastSeenVisibility: value })}>
                <span className="privacy-choice-copy">
                  <strong>{value === "family" ? strings.privacy.family : strings.privacy.nobody}</strong>
                  <small>{value === "family" ? strings.privacy.visibleToFamily : strings.privacy.hiddenFromMembers}</small>
                </span>
                {selected && <span className="privacy-choice-check">✓</span>}
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}

function inviteSummary(value: User["groupInvitePermission"] | undefined) {
  return value === "nobody" ? "No one" : value === "selected" ? "Selected people" : value === "request" ? "Invite requests" : "Everyone";
}

function PrivacyContactRule({ detail, currentUser, members, isSaving, onUpdatePrivacy }: Pick<PrivacySecuritySettingsProps, "currentUser" | "members" | "isSaving" | "onUpdatePrivacy"> & { detail: Exclude<PrivacyDetail, "overview" | "profile" | "lastSeen" | "blocked"> }) {
  const isDM = detail === "directMessages";
  const key = isDM ? "directMessagePermission" : detail === "groupInvites" ? "groupInvitePermission" : detail === "channelInvites" ? "channelInvitePermission" : "voiceInvitePermission";
  const value = currentUser?.[key] ?? (isDM ? "family" : "allow");
  const options = isDM
    ? [["family", "Everyone in this server", "Any family member can start a direct message."], ["selected", "Selected people", "Only people you choose below can start a direct message."], ["nobody", "No one", "Nobody can create a direct message with you."]]
    : [["allow", "Everyone", "Anyone with permission to add people can invite you."], ["selected", "Selected people", "Only people you choose below can invite you."], ["request", "Invite requests only", "Invitations are sent to your direct messages as requests."], ["nobody", "No one", "Nobody can add you to this type of chat."]];
  const selected = currentUser?.invitePermissionUserIds ?? [];
  return <section className="choice-page"><h3>{isDM ? "Who can create direct messages with you?" : "Who can invite you?"}</h3>
    {options.map(([option, title, help]) => <button type="button" disabled={isSaving} className={`privacy-choice${value === option ? " is-selected" : ""}`} key={option} onClick={() => onUpdatePrivacy({ [key]: option } as Partial<User>)}><span className="privacy-choice-copy"><strong>{title}</strong><small>{help}</small></span>{value === option && <span className="privacy-choice-check">✓</span>}</button>)}
    {value === "selected" && <div className="blocked-members-page"><h3>Allowed people</h3>{members.filter((member) => member.id !== currentUser?.id).map((member) => <label className="settings-row" key={member.id}><span><strong>{member.displayName}</strong><small>@{member.username}</small></span><input type="checkbox" checked={selected.includes(member.id)} disabled={isSaving} onChange={() => onUpdatePrivacy({ invitePermissionUserIds: selected.includes(member.id) ? selected.filter((id) => id !== member.id) : [...selected, member.id] })} /></label>)}</div>}
  </section>;
}
