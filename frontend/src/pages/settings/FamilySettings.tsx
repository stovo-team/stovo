import type { AppStrings } from "../../config/strings";
import type { User } from "../../api/auth";

type Props = { strings: AppStrings; members: User[]; canManageFamily: boolean };

export function FamilySettings({ strings, members, canManageFamily }: Props) {
  return <div className="family-settings-members">
    <p className="muted-copy">{strings.settings.familySpaceNote}</p>
    {members.map((member) => <div className="settings-row family-settings-member" key={member.id}>
      <span className="settings-row-icon">{initials(member.displayName)}</span>
      <span><strong>{member.displayName}</strong><small>@{member.username} · {member.role}</small></span>
    </div>)}
    {canManageFamily && <p className="muted-copy">{strings.settings.familyInviteNote}</p>}
  </div>;
}

function initials(name: string | undefined) {
  return (name ?? "Stovo").split(" ").filter(Boolean).slice(0, 2).map((part) => part.at(0)?.toUpperCase()).join("");
}
