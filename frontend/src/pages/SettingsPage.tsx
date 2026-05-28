import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Camera,
  ChevronRight,
  Database,
  HelpCircle,
  Laptop,
  LockKeyhole,
  LogOut,
  Palette,
  RotateCcw,
  Shield,
  Type,
  X
} from "lucide-react";

import {
  ACCENT_OPTIONS,
  BUBBLE_SHAPE_OPTIONS,
  DEFAULT_APPEARANCE,
  DENSITY_OPTIONS,
  THEME_MODE_OPTIONS,
  WALLPAPER_OPTIONS,
  useAppearance
} from "../appearance/AppearanceContext";
import { ApiError } from "../api/client";
import { User } from "../api/auth";
import { Family } from "../api/family";
import { FamilyFile, uploadFile } from "../api/files";
import { useAuth } from "../auth/AuthContext";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import AppNav from "./AppNav";

function initials(name: string | undefined) {
  return (name ?? "Velo")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase())
    .join("");
}

function ProfileAvatar({
  accessToken,
  file,
  label,
  size = "lg"
}: {
  accessToken: string | null;
  file: FamilyFile | null | undefined;
  label: string | undefined;
  size?: "default" | "lg";
}) {
  const previewUrl = useFilePreviewUrl(accessToken, file ?? null, Boolean(file));
  const sizeClass = size === "lg" ? " avatar-lg" : "";

  return (
    <span className={`avatar${sizeClass} user-avatar-preview`}>
      {previewUrl ? <img src={previewUrl} alt="" /> : initials(label)}
    </span>
  );
}

const settingsGroups = [
  {
    title: "Account",
    items: [
      { label: "Privacy and Security", helper: "Last seen, profile visibility, passcode", icon: LockKeyhole },
      { label: "Notifications", helper: "Messages, groups, sounds, previews", icon: Bell },
      { label: "Appearance", helper: "Themes, colors, wallpaper, bubbles", icon: Palette }
    ]
  },
  {
    title: "Storage",
    items: [
      { label: "Data and Storage", helper: "Auto-download, cache, upload behavior", icon: Database },
      { label: "Devices and Sessions", helper: "Current device and active sessions", icon: Laptop }
    ]
  },
  {
    title: "Support",
    items: [
      { label: "Help and Support", helper: "FAQ, report a bug, contact support", icon: HelpCircle },
      { label: "About", helper: "Version, legal, licenses", icon: Shield }
    ]
  }
];

const themePresets = [
  {
    label: "Fresh",
    helper: "Light, blue, dotted chat",
    patch: { themeMode: "light", accent: "blue", wallpaper: "dots", bubbleShape: "rounded" }
  },
  {
    label: "Forest",
    helper: "Dark, green, soft bubbles",
    patch: { themeMode: "dark", accent: "green", wallpaper: "paper", bubbleShape: "soft" }
  },
  {
    label: "Studio",
    helper: "AMOLED, purple, plain",
    patch: { themeMode: "amoled", accent: "purple", wallpaper: "plain", bubbleShape: "rounded" }
  },
  {
    label: "Warm",
    helper: "Light, amber, aurora",
    patch: { themeMode: "light", accent: "amber", wallpaper: "aurora", bubbleShape: "soft" }
  }
] as const;

export default function SettingsPage() {
  const { accessToken, authRequest, currentUser, logout, updateCurrentUser } = useAuth();
  const { appearance, resolvedThemeMode, updateAppearance } = useAppearance();
  const [family, setFamily] = useState<Family | null>(null);
  const [profileForm, setProfileForm] = useState({
    displayName: currentUser?.displayName ?? "",
    familyName: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeSettingsItem, setActiveSettingsItem] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);

  const canManageFamily = currentUser?.role === "owner" || currentUser?.role === "admin";

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const familyResult = await authRequest<Family>("/api/family");
      setFamily(familyResult);
      setProfileForm({
        displayName: currentUser?.displayName ?? "",
        familyName: familyResult.name
      });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load settings");
    } finally {
      setIsLoading(false);
    }
  }, [authRequest, currentUser?.displayName]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleProfileSubmit(event: FormEvent) {
    event.preventDefault();
    if (!currentUser) {
      return;
    }
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      if (
        profileForm.displayName.trim() &&
        profileForm.displayName.trim() !== currentUser.displayName
      ) {
        const updatedUser = await authRequest<User>("/api/auth/me", {
          method: "PATCH",
          body: { displayName: profileForm.displayName.trim() }
        });
        updateCurrentUser(updatedUser);
      }
      if (
        canManageFamily &&
        family &&
        profileForm.familyName.trim() &&
        profileForm.familyName.trim() !== family.name
      ) {
        const updatedFamily = await authRequest<Family>("/api/family", {
          method: "PATCH",
          body: { name: profileForm.familyName.trim() }
        });
        setFamily(updatedFamily);
      }
      setNotice("Profile saved");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not save profile");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleProfilePhotoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!accessToken || !file) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const uploaded = await uploadFile(accessToken, file);
      const updatedUser = await authRequest<User>("/api/auth/me", {
        method: "PATCH",
        body: { profilePhotoFileId: uploaded.id }
      });
      updateCurrentUser(updatedUser);
      setNotice("Profile photo updated");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update profile photo");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="app-shell app-frame settings-page">
      <AppNav />
      <section className="page-surface settings-layout" aria-busy={isLoading}>
        <header className="section-header">
          <div>
            <p className="eyebrow">{family?.name ?? "Velo"}</p>
            <h1>Settings</h1>
          </div>
        </header>

        {error && <p className="error-text" role="alert">{error}</p>}
        {notice && <p className="success-text" role="status">{notice}</p>}

        <section className="profile-card">
          <div className="profile-photo-control">
            <ProfileAvatar
              accessToken={accessToken}
              file={currentUser?.profilePhoto}
              label={profileForm.displayName}
            />
            <button
              type="button"
              className="avatar-edit-button"
              aria-label="Change profile photo"
              title="Change profile photo"
              disabled={isSaving}
              onClick={() => profilePhotoInputRef.current?.click()}
            >
              <Camera aria-hidden="true" size={16} />
            </button>
            <input
              ref={profilePhotoInputRef}
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="visually-hidden"
              disabled={isSaving}
              type="file"
              onChange={handleProfilePhotoSelect}
            />
          </div>
          <div>
            <h2>{profileForm.displayName || "Family member"}</h2>
            <p>{currentUser?.email}</p>
            <span className="role-pill">{currentUser?.role}</span>
          </div>
        </section>

        <form className="settings-form" onSubmit={handleProfileSubmit}>
          <label>
            Avatar display name
            <input
              maxLength={255}
              value={profileForm.displayName}
              onChange={(event) =>
                setProfileForm((current) => ({
                  ...current,
                  displayName: event.target.value
                }))
              }
            />
          </label>
          <label>
            Family space name
            <input
              disabled={!canManageFamily}
              maxLength={255}
              value={profileForm.familyName}
              onChange={(event) =>
                setProfileForm((current) => ({
                  ...current,
                  familyName: event.target.value
                }))
              }
            />
          </label>
          <button type="submit" disabled={isSaving || !profileForm.displayName.trim()}>
            {isSaving ? "Saving" : "Save profile"}
          </button>
        </form>

        <div className="settings-groups">
          {settingsGroups.map((group) => (
            <section className="settings-group" key={group.title}>
              <h2>{group.title}</h2>
              <div className="settings-list">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      className="settings-row"
                      key={item.label}
                      aria-expanded={activeSettingsItem === item.label}
                      onClick={() => setActiveSettingsItem(item.label)}
                    >
                      <span className="settings-row-icon">
                        <Icon aria-hidden="true" size={20} />
                      </span>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.helper}</small>
                      </span>
                      <ChevronRight aria-hidden="true" size={18} />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {activeSettingsItem && (
          <section className="settings-detail-panel" role="region" aria-label={activeSettingsItem}>
            <div className="section-title-row">
              <h2>{activeSettingsItem}</h2>
              <button
                type="button"
                className="icon-button subtle"
                aria-label="Close settings panel"
                onClick={() => setActiveSettingsItem(null)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            {activeSettingsItem === "Appearance" ? (
              <div className="appearance-panel">
                <div className="settings-summary">
                  <span>Current theme</span>
                  <strong>
                    {appearance.themeMode === "system"
                      ? `System / ${resolvedThemeMode}`
                      : appearance.themeMode}
                  </strong>
                </div>
                <div className="appearance-preview">
                  <ProfileAvatar
                    accessToken={accessToken}
                    file={currentUser?.profilePhoto}
                    label={profileForm.displayName}
                    size="default"
                  />
                  <div className="preview-thread">
                    <span className="preview-bubble">Family dinner is at 7.</span>
                    <span className="preview-bubble mine">I will bring dessert.</span>
                  </div>
                </div>
                <div className="appearance-settings">
                  <span className="summary-label">Theme maker</span>
                  <div className="theme-option-grid" role="list" aria-label="Theme presets">
                    {themePresets.map((preset) => (
                      <button
                        type="button"
                        className="theme-option"
                        key={preset.label}
                        onClick={() => updateAppearance(preset.patch)}
                      >
                        <strong>{preset.label}</strong>
                        <small>{preset.helper}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="appearance-settings">
                  <span className="summary-label">Theme mode</span>
                  <div className="theme-option-grid" role="list" aria-label="Theme mode">
                    {THEME_MODE_OPTIONS.map((option) => (
                      <button
                        type="button"
                        className={`theme-option ${appearance.themeMode === option.value ? "active" : ""}`}
                        aria-pressed={appearance.themeMode === option.value}
                        key={option.value}
                        onClick={() => updateAppearance({ themeMode: option.value })}
                      >
                        <strong>{option.label}</strong>
                        <small>
                          {option.value === "system"
                            ? `Using ${resolvedThemeMode}`
                            : option.value === "amoled"
                              ? "Black background preset"
                              : `${option.label} surfaces`}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="appearance-settings">
                  <span className="summary-label">Accent color</span>
                  <div className="swatch-row">
                    {ACCENT_OPTIONS.map((accent) => (
                      <button
                        type="button"
                        className={`color-swatch ${accent.swatchClassName} ${
                          appearance.accent === accent.value ? "active" : ""
                        }`}
                        aria-label={`${accent.label} accent`}
                        title={`${accent.label} accent`}
                        key={accent.value}
                        onClick={() => updateAppearance({ accent: accent.value })}
                      />
                    ))}
                  </div>
                  <label className="color-field">
                    <Palette aria-hidden="true" size={18} />
                    <span>Custom accent</span>
                    <input
                      type="color"
                      value={appearance.customAccent}
                      onChange={(event) =>
                        updateAppearance({ accent: "custom", customAccent: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="appearance-control-grid">
                  <label>
                    Density
                    <select
                      value={appearance.density}
                      onChange={(event) =>
                        updateAppearance({
                          density: event.target.value === "compact" ? "compact" : "comfortable"
                        })
                      }
                    >
                      {DENSITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Wallpaper
                    <select
                      value={appearance.wallpaper}
                      onChange={(event) =>
                        updateAppearance({
                          wallpaper:
                            event.target.value === "paper" ||
                            event.target.value === "aurora" ||
                            event.target.value === "plain"
                              ? event.target.value
                              : "dots"
                        })
                      }
                    >
                      {WALLPAPER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Bubble shape
                    <select
                      value={appearance.bubbleShape}
                      onChange={(event) =>
                        updateAppearance({
                          bubbleShape:
                            event.target.value === "soft" || event.target.value === "square"
                              ? event.target.value
                              : "rounded"
                        })
                      }
                    >
                      {BUBBLE_SHAPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Avatar color
                    <span className="color-field inline">
                      <Type aria-hidden="true" size={18} />
                      <input
                        type="color"
                        value={appearance.avatarColor}
                        onChange={(event) => updateAppearance({ avatarColor: event.target.value })}
                      />
                    </span>
                  </label>
                </div>
                <label className="range-field">
                  <span>
                    Message size
                    <strong>{Math.round(appearance.messageScale * 100)}%</strong>
                  </span>
                  <input
                    type="range"
                    min="0.9"
                    max="1.18"
                    step="0.02"
                    value={appearance.messageScale}
                    onChange={(event) =>
                      updateAppearance({ messageScale: Number(event.target.value) })
                    }
                  />
                </label>
                <button type="button" className="subtle-action" onClick={() => updateAppearance(DEFAULT_APPEARANCE)}>
                  <RotateCcw aria-hidden="true" size={18} />
                  Reset appearance
                </button>
              </div>
            ) : activeSettingsItem === "Data and Storage" ? (
              <p className="muted-copy">
                Storage files can be uploaded, downloaded, favorited, and deleted from the Storage screen.
              </p>
            ) : activeSettingsItem === "Notifications" ? (
              <p className="muted-copy">
                Notification preferences are managed per chat with the mute button in chat details.
              </p>
            ) : (
              <p className="muted-copy">
                This area is ready for Velo controls as they are added.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setNotice(`${activeSettingsItem} opened`);
                setActiveSettingsItem(null);
              }}
            >
              Done
            </button>
          </section>
        )}

        <button className="logout-row" type="button" onClick={() => void logout()}>
          <LogOut aria-hidden="true" size={20} />
          Log out
        </button>
      </section>
    </main>
  );
}
