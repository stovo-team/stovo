import type { ReactNode } from "react";
import { Clock3, ChevronRight, LockKeyhole, Mail, UserRound, UserRoundX } from "lucide-react";
import type { AppStrings } from "../../config/strings";
import type { User } from "../../api/auth";

export type PrivacyDetail = "overview" | "profile" | "lastSeen" | "blocked";

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
  onUpdatePrivacy: (patch: Partial<Pick<User, "profileVisibility" | "lastSeenVisibility" | "readReceiptsEnabled">>) => void;
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
