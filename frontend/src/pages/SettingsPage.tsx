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
  Clock3,
  ChevronLeft,
  ChevronRight,
  Database,
  HelpCircle,
  Laptop,
  LockKeyhole,
  Mail,
  UserRound,
  UserRoundX,
  LogOut,
  Palette,
  RotateCcw,
  Server,
  Shield,
  Type,
  Users,
  X
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

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
import { Family, getMembers } from "../api/family";
import { FamilyFile, uploadFile } from "../api/files";
import { useAuth } from "../auth/AuthContext";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import {
  DevicePreferences,
  readDevicePreferences,
  writeDevicePreferences
} from "../settings/devicePreferences";
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
    title: "Your space",
    items: [
      { label: "Appearance", helper: "AMOLED · Blue · Comfortable", icon: Palette },
      { label: "Notifications", helper: "Messages, calls, and quiet hours", icon: Bell },
      { label: "Privacy and Security", helper: "Profile visibility and read receipts", icon: LockKeyhole },
      { label: "Help and About", helper: "Version and support", icon: HelpCircle }
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
              {THEME_MODE_OPTIONS.filter((option) => option.value !== "light").map((option) => (
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
            <p className="appearance-section-label">Accent colour</p>
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

          <section className="appearance-section-card">
            <p className="appearance-section-label">Chat media</p>
            <label className="appearance-toggle-row">
              <span>
                <strong>Video autoplay</strong>
                <span className="appearance-toggle-help">Muted inline preview like Telegram</span>
              </span>
              <input
                type="checkbox"
                checked={appearance.videoAutoplay}
                aria-label="Video autoplay"
                onChange={(event) => updateAppearance({ videoAutoplay: event.target.checked })}
              />
            </label>
            <label className="appearance-toggle-row">
              <span>
                <strong>Render markdown</strong>
                <span className="appearance-toggle-help">Bold, italic, links, code, and more</span>
              </span>
              <input
                type="checkbox"
                checked={appearance.renderMarkdown}
                aria-label="Render markdown"
                onChange={(event) => updateAppearance({ renderMarkdown: event.target.checked })}
              />
            </label>
            <label className="appearance-toggle-row">
              <span>
                <strong>Enter to send</strong>
                <span className="appearance-toggle-help">
                  Off: Enter adds a new line, Ctrl/Cmd+Enter sends
                </span>
              </span>
              <input
                type="checkbox"
                checked={appearance.sendOnEnter}
                aria-label="Enter to send"
                onChange={(event) => updateAppearance({ sendOnEnter: event.target.checked })}
              />
            </label>
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
  const location = useLocation();
  const { accessToken, authRequest, currentUser, logout, updateCurrentUser } = useAuth();
  const [currentServerUrl] = useState(() => getApiUrl());
  const [family, setFamily] = useState<Family | null>(null);
  const [profileForm, setProfileForm] = useState({
    displayName: currentUser?.displayName ?? "",
    familyName: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeSettingsItem, setActiveSettingsItem] = useState<string | null>(() => new URLSearchParams(location.search).has("family") ? "Family" : null);
  const [devicePreferences, setDevicePreferences] = useState<DevicePreferences>(() =>
    readDevicePreferences()
  );
  const [members, setMembers] = useState<User[]>([]);
  const [blockedMemberIds, setBlockedMemberIds] = useState<string[]>([]);
  const [privacyDetail, setPrivacyDetail] = useState<"overview" | "profile" | "lastSeen" | "blocked">("overview");
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
      const memberResult = await getMembers(accessToken ?? "");
      const blockedResult = await authRequest<User[]>("/api/privacy/blocks");
      setFamily(familyResult);
      setMembers(memberResult);
      setBlockedMemberIds(blockedResult.map((member) => member.id));
      setProfileForm({
        displayName: currentUser?.displayName ?? "",
        familyName: familyResult.name
      });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load settings");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authRequest, currentUser?.displayName]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDevicePreferences(patch: Partial<DevicePreferences>) {
    const next = writeDevicePreferences(patch);
    setDevicePreferences(next);
  }

  async function updatePrivacy(patch: Partial<Pick<User, "profileVisibility" | "lastSeenVisibility" | "readReceiptsEnabled">>) {
    if (!currentUser) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await authRequest<User>("/api/auth/me", { method: "PATCH", body: patch });
      updateCurrentUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update privacy settings");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleBlock(member: User) {
    const isBlocked = blockedMemberIds.includes(member.id);
    setIsSaving(true);
    setError(null);
    try {
      await authRequest(isBlocked ? `/api/privacy/blocks/${member.id}` : `/api/privacy/blocks/${member.id}`, {
        method: isBlocked ? "DELETE" : "POST"
      });
      setBlockedMemberIds((current) => isBlocked ? current.filter((id) => id !== member.id) : [...current, member.id]);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update blocked members");
    } finally {
      setIsSaving(false);
    }
  }

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
            {!activeSettingsItem && (
              <>
            <header className="section-header">
              <div>
                <p className="eyebrow">{family?.name ?? "Stovo"}</p>
                <h1>Settings</h1>
              </div>
            </header>

            {error && <p className="error-text" role="alert">{error}</p>}
            {notice && <p className="success-text" role="status">{notice}</p>}

            <div className="settings-dashboard">
            <section
              className="profile-card settings-profile-tile"
            >
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
              <button
                type="button"
                className="settings-profile-open"
                aria-label="Open profile settings"
                onClick={() => setActiveSettingsItem("Profile")}
              >
                <span>
                  <h2>{profileForm.displayName || "Family member"}</h2>
                  <p>@{currentUser?.username}</p>
                  <span className="role-pill">{currentUser?.role}</span>
                </span>
                <ChevronRight aria-hidden="true" size={22} />
              </button>
            </section>

            {activeSettingsItem === "Profile" && <form className="settings-form" onSubmit={handleProfileSubmit}>
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
            </form>}

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
                          className={`settings-row settings-tile settings-tile--${item.label.toLowerCase().replaceAll(" ", "-")}${activeSettingsItem === item.label ? " is-active" : ""}`}
                          key={item.label}
                          aria-expanded={activeSettingsItem === item.label}
                          aria-label={`Open ${item.label.toLowerCase()} settings`}
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
            <section className="settings-server-tile">
              <button
                type="button"
                className="settings-row settings-tile--server"
                onClick={async () => {
                  await logout();
                  setApiUrlOverride(null);
                  navigate("/server-setup", { replace: true });
                }}
              >
                <span className="settings-row-icon"><Server aria-hidden="true" size={20} /></span>
                <span><strong>Change server address</strong><small>{currentServerUrl}</small></span>
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            </section>
            </div>
              </>
            )}

            {activeSettingsItem && activeSettingsItem !== "Appearance" && (
              <section
                className="settings-detail-panel"
                role="region"
                aria-label={activeSettingsItem}
              >
                <div className="section-title-row">
                  <button
                    type="button"
                    className="icon-button subtle"
                    aria-label="Close settings panel"
                    onClick={() => activeSettingsItem === "Privacy and Security" && privacyDetail !== "overview" ? setPrivacyDetail("overview") : setActiveSettingsItem(null)}
                  >
                    <ChevronLeft aria-hidden="true" size={22} />
                  </button>
                  <h2>{activeSettingsItem}</h2>
                </div>
                {activeSettingsItem === "Profile" ? (
                  <div className="profile-detail-screen">
                    <section className="profile-detail-hero">
                      <div className="profile-detail-avatar-wrap">
                        <ProfileAvatar accessToken={accessToken} file={currentUser?.profilePhoto} label={profileForm.displayName} size="lg" />
                        <button type="button" className="avatar-edit-button" aria-label="Change profile photo" disabled={isSaving} onClick={() => profilePhotoInputRef.current?.click()}><Camera aria-hidden="true" size={16} /></button>
                        <input ref={profilePhotoInputRef} accept="image/jpeg,image/png,image/gif,image/webp" className="visually-hidden" disabled={isSaving} type="file" onChange={handleProfilePhotoSelect} />
                      </div>
                      <div><h3>{profileForm.displayName || "Family member"}</h3><p>@{currentUser?.username}</p><span className="role-pill">{currentUser?.role}</span></div>
                    </section>
                    <form className="profile-detail-form" onSubmit={handleProfileSubmit}>
                      <label><span><UserRound aria-hidden="true" size={21} />Display name</span><input maxLength={255} value={profileForm.displayName} onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))} /></label>
                      <label><span><Users aria-hidden="true" size={21} />Family</span><input disabled={!canManageFamily} maxLength={255} value={profileForm.familyName} onChange={(event) => setProfileForm((current) => ({ ...current, familyName: event.target.value }))} /></label>
                      <button type="submit" disabled={isSaving || !profileForm.displayName.trim()}>{isSaving ? "Saving" : "Save profile"}</button>
                    </form>
                  </div>
                ) : activeSettingsItem === "Notifications" ? (
                  <div className="settings-toggle-groups">
                    <section>
                      <h3>Messages</h3>
                      {([
                        ["messageNotifications", "Message notifications"],
                        ["messagePreview", "Message preview"],
                        ["messageSound", "Sound"]
                      ] as const).map(([key, label]) => (
                        <label className="appearance-toggle-row" key={key}>
                          <strong>{label}</strong>
                          <input
                            type="checkbox"
                            checked={devicePreferences[key]}
                            onChange={(event) => updateDevicePreferences({ [key]: event.target.checked })}
                          />
                        </label>
                      ))}
                    </section>
                    <section>
                      <h3>Calls</h3>
                      {([
                        ["callNotifications", "Call notifications"],
                        ["ringtoneEnabled", "Ringtone"]
                      ] as const).map(([key, label]) => (
                        <label className="appearance-toggle-row" key={key}>
                          <strong>{label}</strong>
                          <input
                            type="checkbox"
                            checked={devicePreferences[key]}
                            onChange={(event) => updateDevicePreferences({ [key]: event.target.checked })}
                          />
                        </label>
                      ))}
                    </section>
                    <section>
                      <h3>Quiet hours</h3>
                      <label className="appearance-toggle-row">
                        <span><strong>Mute notifications</strong><span className="appearance-toggle-help">{devicePreferences.quietHoursStart} — {devicePreferences.quietHoursEnd}</span></span>
                        <input type="checkbox" checked={devicePreferences.quietHoursEnabled} onChange={(event) => updateDevicePreferences({ quietHoursEnabled: event.target.checked })} />
                      </label>
                      <div className="quiet-hours-times">
                        <label>
                          Start
                          <input
                            aria-label="Quiet hours start"
                            type="time"
                            value={devicePreferences.quietHoursStart}
                            onChange={(event) => updateDevicePreferences({ quietHoursStart: event.target.value })}
                          />
                        </label>
                        <label>
                          End
                          <input
                            aria-label="Quiet hours end"
                            type="time"
                            value={devicePreferences.quietHoursEnd}
                            onChange={(event) => updateDevicePreferences({ quietHoursEnd: event.target.value })}
                          />
                        </label>
                      </div>
                    </section>
                  </div>
                ) : activeSettingsItem === "Privacy and Security" && privacyDetail === "overview" ? (
                  <div className="settings-toggle-groups">
                    <button type="button" className="privacy-row" onClick={() => setPrivacyDetail("profile")}><UserRound aria-hidden="true" /><span><strong>Profile visibility</strong><small>{currentUser?.profileVisibility === "nobody" ? "Nobody" : "Family"}</small></span><ChevronRight aria-hidden="true" /></button>
                    <button type="button" className="privacy-row" onClick={() => setPrivacyDetail("lastSeen")}><Clock3 aria-hidden="true" /><span><strong>Last seen</strong><small>{currentUser?.lastSeenVisibility === "nobody" ? "Nobody" : "Family"}</small></span><ChevronRight aria-hidden="true" /></button>
                    <label className="privacy-row"><Mail aria-hidden="true" /><span><strong>Read receipts</strong><small>Let people know when you have read their messages</small></span><input type="checkbox" checked={currentUser?.readReceiptsEnabled ?? true} disabled={isSaving} onChange={(event) => void updatePrivacy({ readReceiptsEnabled: event.target.checked })} /></label>
                    <button type="button" className="privacy-row" onClick={() => setNotice("App lock needs a device PIN or biometric bridge")}><LockKeyhole aria-hidden="true" /><span><strong>App lock</strong><small>Off</small></span><ChevronRight aria-hidden="true" /></button>
                    <button type="button" className="privacy-row" onClick={() => setPrivacyDetail("blocked")}><UserRoundX aria-hidden="true" /><span><strong>Blocked members</strong></span><ChevronRight aria-hidden="true" /></button>
                  </div>
                ) : activeSettingsItem === "Privacy and Security" ? (
                  <div className="settings-toggle-groups">
                    {privacyDetail === "blocked" ? <section className="blocked-members-page"><h3>Blocked members</h3>{members.filter((member) => member.id !== currentUser?.id).map((member) => { const isBlocked = blockedMemberIds.includes(member.id); return <div className="settings-row" key={member.id}><ProfileAvatar accessToken={accessToken} file={member.profilePhoto} label={member.displayName} size="default" /><span><strong>{member.displayName}</strong><small>@{member.username}</small></span><button type="button" disabled={isSaving} onClick={() => void toggleBlock(member)}>{isBlocked ? "Unblock" : "Block"}</button></div>; })}</section> : <section className="choice-page"><h3>{privacyDetail === "profile" ? "Profile visibility" : "Last seen"}</h3>{(["family", "nobody"] as const).map((value) => <button type="button" className="privacy-choice" key={value} onClick={() => void updatePrivacy(privacyDetail === "profile" ? { profileVisibility: value } : { lastSeenVisibility: value })}><span><strong>{value === "family" ? "Family" : "Nobody"}</strong><small>{value === "family" ? "Visible to everyone in your family" : "Hidden from other members"}</small></span>{(privacyDetail === "profile" ? currentUser?.profileVisibility : currentUser?.lastSeenVisibility) === value && <span className="privacy-choice-check">✓</span>}</button>)}</section>}
                  </div>
                ) : activeSettingsItem === "Family" ? (
                  <div className="family-settings-members">
                    <p className="muted-copy">Your shared family space. Calendar permissions follow each member’s role.</p>
                    {members.map((member) => (
                      <div className="settings-row family-settings-member" key={member.id}>
                        <span className="settings-row-icon">{initials(member.displayName)}</span>
                        <span><strong>{member.displayName}</strong><small>@{member.username} · {member.role}</small></span>
                      </div>
                    ))}
                    {canManageFamily && <p className="muted-copy">Invitation and role management remains available here as the Family controls expand.</p>}
                  </div>
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

            {!activeSettingsItem && (
              <>
            <button className="logout-row" type="button" onClick={() => void logout()}>
              <LogOut aria-hidden="true" size={20} />
              Log out
            </button>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
