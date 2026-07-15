import {
  ChangeEvent,
  FormEvent,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import {
  Bell,
  Camera,
  ChevronLeft,
  ChevronRight,
  Database,
  HelpCircle,
  Laptop,
  LockKeyhole,
  LogOut,
  Palette,
  RotateCcw,
  Server,
  Shield,
  Type,
  X
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  ACCENT_OPTIONS,
  AppearanceSettings,
  BUBBLE_SHAPE_OPTIONS,
  DEFAULT_APPEARANCE,
  DENSITY_OPTIONS,
  THEME_MODE_OPTIONS,
  WallpaperChoice,
  useAppearance
} from "../appearance/AppearanceContext";
import { ApiError, getApiUrl, setApiUrlOverride } from "../api/client";
import { User } from "../api/auth";
import { Family } from "../api/family";
import { FamilyFile, uploadFile } from "../api/files";
import { useAuth } from "../auth/AuthContext";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import AppNav from "./AppNav";

function initials(name: string | undefined) {
  return (name ?? "Stovo")
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

const themePresets: Array<{
  label: string;
  helper: string;
  patch: Partial<AppearanceSettings>;
}> = [
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
];

const wallpaperTileMeta: Array<{ value: WallpaperChoice; label: string; thumbClass: string }> = [
  { value: "dots", label: "Dots", thumbClass: "appearance-wallpaper-thumb--dots" },
  { value: "paper", label: "Paper", thumbClass: "appearance-wallpaper-thumb--paper" },
  { value: "aurora", label: "Aurora", thumbClass: "appearance-wallpaper-thumb--aurora" },
  { value: "plain", label: "Plain", thumbClass: "appearance-wallpaper-thumb--plain" }
];

function AppearanceEditor({
  displayName,
  onBack,
  backButtonRef
}: {
  displayName: string;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const { appearance, resolvedThemeMode, updateAppearance } = useAppearance();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    backButtonRef.current?.focus();
  }, [backButtonRef]);

  function handleResetConfirm() {
    updateAppearance(DEFAULT_APPEARANCE);
    setResetConfirmOpen(false);
  }

  const previewHero = (
    <div
      className="appearance-preview-hero"
      role="img"
      aria-label="Theme preview"
    >
      <span className="preview-avatar" aria-hidden="true">
        {initials(displayName)}
      </span>
      <div className="preview-thread">
        <span className="preview-bubble">Family dinner is at 7.</span>
        <span className="preview-bubble mine">I will bring dessert.</span>
      </div>
    </div>
  );

  return (
    <>
      <div className="appearance-editor appearance-editor-enter">
        <header className="appearance-editor-header">
          <button
            ref={backButtonRef}
            type="button"
            className="icon-button subtle appearance-editor-back"
            aria-label="Back to settings"
            onClick={onBack}
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
          <h2 className="appearance-editor-title" tabIndex={-1}>
            Appearance
          </h2>
        </header>

        <div className="appearance-editor-preview-column">{previewHero}</div>

        <div className="appearance-editor-controls">
          <section className="appearance-section-card">
            <p className="appearance-section-label">Quick looks</p>
            <div className="appearance-preset-scroll" role="list" aria-label="Theme presets">
              {themePresets.map((preset) => (
                <button
                  type="button"
                  className="appearance-preset-card"
                  key={preset.label}
                  onClick={() => updateAppearance(preset.patch)}
                >
                  <strong>{preset.label}</strong>
                  <small>{preset.helper}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="appearance-section-card">
            <p className="appearance-section-label">Theme</p>
            <div className="appearance-segment" role="tablist" aria-label="Theme mode">
              {THEME_MODE_OPTIONS.map((option) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={appearance.themeMode === option.value}
                  className={appearance.themeMode === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => updateAppearance({ themeMode: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {appearance.themeMode === "system" && (
              <small className="muted-copy">Using {resolvedThemeMode}</small>
            )}
          </section>

          <section className="appearance-section-card">
            <p className="appearance-section-label">Accent color</p>
            <div className="appearance-swatch-row">
              {ACCENT_OPTIONS.map((accent) => (
                <button
                  type="button"
                  className={`color-swatch ${accent.swatchClassName} ${
                    appearance.accent === accent.value ? "active" : ""
                  }`}
                  aria-label={`${accent.label} accent`}
                  aria-pressed={appearance.accent === accent.value}
                  title={`${accent.label} accent`}
                  key={accent.value}
                  onClick={() => updateAppearance({ accent: accent.value })}
                />
              ))}
            </div>
            <label className="color-field">
              <Palette aria-hidden="true" size={18} />
              <span>Custom color</span>
              <input
                type="color"
                value={appearance.customAccent}
                onChange={(event) =>
                  updateAppearance({ accent: "custom", customAccent: event.target.value })
                }
              />
            </label>
          </section>

          <section className="appearance-section-card">
            <p className="appearance-section-label">Chat background</p>
            <div className="appearance-wallpaper-grid" role="radiogroup" aria-label="Chat background">
              {wallpaperTileMeta.map((tile) => (
                <button
                  type="button"
                  className="appearance-wallpaper-tile"
                  role="radio"
                  aria-checked={appearance.wallpaper === tile.value}
                  key={tile.value}
                  onClick={() => updateAppearance({ wallpaper: tile.value })}
                >
                  <span className={`appearance-wallpaper-thumb ${tile.thumbClass}`} aria-hidden="true" />
                  <span>{tile.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="appearance-section-card">
            <p className="appearance-section-label">Message bubbles</p>
            <div className="appearance-chip-row" role="group" aria-label="Bubble shape">
              {BUBBLE_SHAPE_OPTIONS.map((option) => (
                <button
                  type="button"
                  className={`appearance-chip ${appearance.bubbleShape === option.value ? "active" : ""}`}
                  aria-pressed={appearance.bubbleShape === option.value}
                  key={option.value}
                  onClick={() => updateAppearance({ bubbleShape: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="appearance-section-card">
            <div className="appearance-inline-row">
              <span className="appearance-section-label" style={{ margin: 0 }}>
                Density
              </span>
              <div className="appearance-segment appearance-segment--2" role="group" aria-label="Density">
                {DENSITY_OPTIONS.map((option) => (
                  <button
                    type="button"
                    className={appearance.density === option.value ? "active" : ""}
                    aria-pressed={appearance.density === option.value}
                    key={option.value}
                    onClick={() => updateAppearance({ density: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="appearance-section-card">
            <label className="range-field">
              <span className="appearance-inline-row">
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
          </section>

          <section className="appearance-section-card">
            <div className="appearance-inline-row">
              <span className="appearance-section-label" style={{ margin: 0 }}>
                Avatar color
              </span>
              <span className="color-field inline">
                <Type aria-hidden="true" size={18} />
                <input
                  type="color"
                  value={appearance.avatarColor}
                  aria-label="Avatar color"
                  onChange={(event) => updateAppearance({ avatarColor: event.target.value })}
                />
              </span>
            </div>
          </section>

          <button
            type="button"
            className="subtle-action"
            onClick={() => setResetConfirmOpen(true)}
          >
            <RotateCcw aria-hidden="true" size={18} />
            Reset to defaults
          </button>
        </div>
      </div>

      {resetConfirmOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setResetConfirmOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setResetConfirmOpen(false);
            }
          }}
        >
          <section
            className="messenger-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appearance-reset-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="appearance-reset-title">Reset all appearance settings?</h2>
            </div>
            <p className="muted-copy">
              Your theme, accent, wallpaper, and chat display options will return to Stovo defaults.
            </p>
            <div className="segmented-control">
              <button type="button" onClick={() => setResetConfirmOpen(false)}>
                Keep my theme
              </button>
              <button type="button" onClick={handleResetConfirm}>
                Reset
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { accessToken, authRequest, currentUser, logout, updateCurrentUser } = useAuth();
  const [currentServerUrl] = useState(() => getApiUrl());
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
  const appearanceBackRef = useRef<HTMLButtonElement | null>(null);

  const canManageFamily = currentUser?.role === "owner" || currentUser?.role === "admin";
  const isAppearanceEditor = activeSettingsItem === "Appearance";
  const hasDetailSurface = Boolean(activeSettingsItem);

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
    <main
      className={`app-shell app-frame settings-page${hasDetailSurface ? " settings-detail-view" : ""}${isAppearanceEditor ? " settings-appearance-view" : ""}`}
    >
      <AppNav />
      <section
        className={`page-surface settings-layout${hasDetailSurface ? " settings-layout--detail-open" : ""}`}
        aria-busy={isLoading}
      >
        {isAppearanceEditor ? (
          <AppearanceEditor
            displayName={profileForm.displayName}
            backButtonRef={appearanceBackRef}
            onBack={() => setActiveSettingsItem(null)}
          />
        ) : (
          <>
            <header className="section-header">
              <div>
                <p className="eyebrow">{family?.name ?? "Stovo"}</p>
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
                <p>@{currentUser?.username}</p>
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
                          className={`settings-row${activeSettingsItem === item.label ? " is-active" : ""}`}
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

            {activeSettingsItem && activeSettingsItem !== "Appearance" && (
              <section
                className="settings-detail-panel"
                role="region"
                aria-label={activeSettingsItem}
              >
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
                {activeSettingsItem === "Data and Storage" ? (
                  <p className="muted-copy">
                    Storage files can be uploaded, downloaded, favorited, and deleted from the Storage screen.
                  </p>
                ) : activeSettingsItem === "Notifications" ? (
                  <p className="muted-copy">
                    Notification preferences are managed per chat with the mute button in chat details.
                  </p>
                ) : (
                  <p className="muted-copy">
                    This area is ready for Stovo controls as they are added.
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

            <section className="settings-group">
              <h2>Server</h2>
              <div className="settings-list">
                <button
                  type="button"
                  className="settings-row"
                  onClick={async () => {
                    await logout();
                    setApiUrlOverride(null);
                    navigate("/server-setup", { replace: true });
                  }}
                >
                  <span className="settings-row-icon">
                    <Server aria-hidden="true" size={20} />
                  </span>
                  <span>
                    <strong>Change server address</strong>
                    <small>{currentServerUrl}</small>
                  </span>
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              </div>
            </section>

            <button className="logout-row" type="button" onClick={() => void logout()}>
              <LogOut aria-hidden="true" size={20} />
              Log out
            </button>
          </>
        )}
      </section>
    </main>
  );
}
