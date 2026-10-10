import type { ReactNode } from "react";
import { Clock3, ChevronRight, LockKeyhole, Mail, UserPlus, UsersRound, UserRound, UserRoundX, Volume2 } from "lucide-react";
import type { AppStrings } from "../../config/strings";
import type { User } from "../../api/auth";
import type { IntelligenceAuthRequest } from "../../api/intelligence";
import { IntelligenceConnectionsSettings } from "./IntelligenceConnectionsSettings";

export type PrivacyDetail = "overview" | "profile" | "lastSeen" | "blocked" | "invitations" | "directMessages" | "groupInvites" | "channelInvites" | "voiceInvites" | "intelligence";

interface PrivacySecuritySettingsProps {
  strings: AppStrings;
  authRequest: IntelligenceAuthRequest;
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
  authRequest,
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
            <small>{currentUser?.profileVisibility === "nobody" ? strings.privacy.nobody : strings.privacy.everyone}</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button type="button" className="privacy-row" onClick={() => onDetailChange("lastSeen")}>
          <Clock3 aria-hidden="true" />
          <span>
            <strong>{strings.privacy.lastSeen}</strong>
            <small>{currentUser?.lastSeenVisibility === "nobody" ? strings.privacy.nobody : strings.privacy.everyone}</small>
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
        <button type="button" className="privacy-row" onClick={() => onDetailChange("invitations")}>
          <UserPlus aria-hidden="true" />
          <span><strong>{strings.privacy.invitationsAndMessages}</strong><small>{strings.privacy.invitationsAndMessagesHelp}</small></span>
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
        <button type="button" className="privacy-row" onClick={() => onDetailChange("intelligence")}>
          <UsersRound aria-hidden="true" />
          <span><strong>{strings.intelligence.connectionsTitle}</strong><small>{strings.intelligence.connectionsDescription}</small></span>
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
      ) : detail === "intelligence" ? (
        <IntelligenceConnectionsSettings strings={strings} authRequest={authRequest} />
      ) : detail === "invitations" ? (
        <section className="settings-toggle-groups">
          <button type="button" className="privacy-row" onClick={() => onDetailChange("directMessages")}><Mail aria-hidden="true" /><span><strong>{strings.privacy.directMessages}</strong><small>{strings.privacy.directMessagesHelp}</small></span><ChevronRight aria-hidden="true" /></button>
          <button type="button" className="privacy-row" onClick={() => onDetailChange("groupInvites")}><UsersRound aria-hidden="true" /><span><strong>{strings.privacy.groupInvitations}</strong><small>{inviteSummary(strings, currentUser?.groupInvitePermission)}</small></span><ChevronRight aria-hidden="true" /></button>
          <button type="button" className="privacy-row" onClick={() => onDetailChange("channelInvites")}><UserPlus aria-hidden="true" /><span><strong>{strings.privacy.channelInvitations}</strong><small>{inviteSummary(strings, currentUser?.channelInvitePermission)}</small></span><ChevronRight aria-hidden="true" /></button>
          <button type="button" className="privacy-row" onClick={() => onDetailChange("voiceInvites")}><Volume2 aria-hidden="true" /><span><strong>{strings.privacy.voiceChannelInvitations}</strong><small>{inviteSummary(strings, currentUser?.voiceInvitePermission)}</small></span><ChevronRight aria-hidden="true" /></button>
        </section>
      ) : detail === "directMessages" || detail === "groupInvites" || detail === "channelInvites" || detail === "voiceInvites" ? (
        <PrivacyContactRule detail={detail} strings={strings} currentUser={currentUser} members={members} isSaving={isSaving} onUpdatePrivacy={onUpdatePrivacy} />
      ) : (
        <section className="choice-page">
          <h3>{detail === "profile" ? strings.privacy.profileVisibility : strings.privacy.lastSeen}</h3>
          {(["family", "nobody"] as const).map((value) => {
            const selected = (detail === "profile" ? currentUser?.profileVisibility : currentUser?.lastSeenVisibility) === value;
            return (
              <button type="button" className={`privacy-choice${selected ? " is-selected" : ""}`} key={value} onClick={() => onUpdatePrivacy(detail === "profile" ? { profileVisibility: value } : { lastSeenVisibility: value })}>
                <span className="privacy-choice-copy">
                  <strong>{value === "family" ? strings.privacy.everyone : strings.privacy.nobody}</strong>
                  <small>{value === "family" ? strings.privacy.visibleToEveryone : strings.privacy.hiddenFromMembers}</small>
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

function inviteSummary(strings: AppStrings, value: User["groupInvitePermission"] | undefined) {
  return value === "nobody" ? strings.privacy.noOne : value === "selected" ? strings.privacy.selectedPeople : value === "request" ? strings.privacy.inviteRequests : strings.privacy.everyone;
}

function PrivacyContactRule({ detail, currentUser, members, isSaving, onUpdatePrivacy, strings }: Pick<PrivacySecuritySettingsProps, "currentUser" | "members" | "isSaving" | "onUpdatePrivacy" | "strings"> & { detail: Exclude<PrivacyDetail, "overview" | "profile" | "lastSeen" | "blocked" | "invitations" | "intelligence"> }) {
  const isDM = detail === "directMessages";
  const key = isDM ? "directMessagePermission" : detail === "groupInvites" ? "groupInvitePermission" : detail === "channelInvites" ? "channelInvitePermission" : "voiceInvitePermission";
  const value = currentUser?.[key] ?? (isDM ? "family" : "allow");
  const options = isDM
    ? [["family", strings.privacy.everyoneInServer, strings.privacy.everyoneInServerHelp], ["selected", strings.privacy.selectedPeople, strings.privacy.selectedPeopleMessageHelp], ["nobody", strings.privacy.noOne, strings.privacy.noOneMessageHelp]]
    : [["allow", strings.privacy.everyone, strings.privacy.everyoneCanInvite], ["selected", strings.privacy.selectedPeople, strings.privacy.selectedPeopleInviteHelp], ["request", strings.privacy.inviteRequests, strings.privacy.inviteRequestsHelp], ["nobody", strings.privacy.noOne, strings.privacy.noOneInviteHelp]];
  const selected = currentUser?.invitePermissionUserIds ?? [];
  return <section className="choice-page"><h3>{isDM ? strings.privacy.whoCanMessageYou : strings.privacy.whoCanInviteYou}</h3>
    {options.map(([option, title, help]) => <button type="button" disabled={isSaving} className={`privacy-choice${value === option ? " is-selected" : ""}`} key={option} onClick={() => onUpdatePrivacy({ [key]: option } as Partial<User>)}><span className="privacy-choice-copy"><strong>{title}</strong><small>{help}</small></span>{value === option && <span className="privacy-choice-check">✓</span>}</button>)}
    {value === "selected" && <div className="blocked-members-page"><h3>{strings.privacy.allowedPeople}</h3>{members.filter((member) => member.id !== currentUser?.id).map((member) => <label className="settings-row" key={member.id}><span><strong>{member.displayName}</strong><small>@{member.username}</small></span><input type="checkbox" checked={selected.includes(member.id)} disabled={isSaving} onChange={() => onUpdatePrivacy({ invitePermissionUserIds: selected.includes(member.id) ? selected.filter((id) => id !== member.id) : [...selected, member.id] })} /></label>)}</div>}
  </section>;
}
