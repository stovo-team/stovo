import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ACCENT_OPTIONS, type AppearanceSettings } from "../../appearance/AppearanceContext";
import type { AppStrings } from "../../config/strings";

export type SettingsDashboardGroup = { title: string; items: Array<{ id: string; label: string; helper: string; icon: LucideIcon }> };

type Props = {
  strings: AppStrings;
  profilePhotoControl: ReactNode;
  profileName: string;
  role?: string;
  groups: SettingsDashboardGroup[];
  appearance: AppearanceSettings;
  appearanceHelper: string;
  onOpen: (item: string) => void;
};

export function SettingsDashboard({ strings, profilePhotoControl, profileName, role, groups, appearance, appearanceHelper, onOpen }: Props) {
  return <div className="settings-dashboard">
    <section className="profile-card settings-profile-tile">
      <div className="profile-photo-control">{profilePhotoControl}</div>
      <button type="button" className="settings-profile-open" aria-label={strings.settings.openProfileSettings} onClick={() => onOpen("Profile")}>
        <span><h2>{profileName || strings.settings.familyMember}</h2><span className="role-pill">{role}</span></span>
        <ChevronRight aria-hidden="true" size={18} />
      </button>
    </section>
    <div className="settings-groups">{groups.map((group) => <section className="settings-group" key={group.title}>
      <h2>{group.title}</h2><div className="settings-list">{group.items.map((item) => {
        const Icon = item.icon; const isAppearance = item.id === "Appearance";
        return <button type="button" className={`settings-row settings-tile settings-tile--${item.id.toLowerCase().replaceAll(" ", "-")}`} key={item.id} aria-expanded={false} aria-label={strings.settings.openSectionAria(item.label)} onClick={() => onOpen(item.id)}>
          <span className="settings-row-icon"><Icon aria-hidden="true" size={20} /></span>
          <span><strong>{item.label}</strong><small>{isAppearance ? appearanceHelper : item.helper}</small></span><ChevronRight aria-hidden="true" size={18} />
          {isAppearance && <AppearancePreview strings={strings} name={profileName} appearance={appearance} />}
        </button>;
      })}</div>
    </section>)}</div>
  </div>;
}

function AppearancePreview({ strings, name, appearance }: { strings: AppStrings; name: string; appearance: AppearanceSettings }) {
  return <div className="settings-appearance-preview" aria-hidden="true"><div className="settings-appearance-preview-chat"><span className="preview-avatar">{initials(name)}</span><div className="preview-thread"><span className="preview-bubble">{strings.appearance.previewBubble1}</span><span className="preview-bubble mine">{strings.appearance.previewBubble2}</span></div></div><div className="settings-appearance-preview-meta"><div className="settings-appearance-preview-swatches">{ACCENT_OPTIONS.filter((option) => option.value !== "custom").map((accent) => <span key={accent.value} className={`color-swatch ${accent.swatchClassName}${appearance.accent === accent.value ? " active" : ""}`} />)}</div><span>{strings.settings.tapToPersonalize}</span></div></div>;
}

function initials(name: string) { return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part.at(0)?.toUpperCase()).join(""); }
