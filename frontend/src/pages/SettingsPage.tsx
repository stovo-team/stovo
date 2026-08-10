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
  Users,
  X
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  authenticateAppLock,
  getAppLockAvailability,
  isAndroidAppLockAvailablePlatform
} from "../native/appLockPlugin";

import {
  ACCENT_OPTIONS,
  AppearanceSettings,
  BUBBLE_SHAPE_OPTIONS,
  DEFAULT_APPEARANCE,
  DENSITY_OPTIONS,
  MESSAGE_FONT_OPTIONS,
  PRESET_ACCENT_OPTIONS,
  THEME_MODE_OPTIONS,
  WallpaperChoice,
  useAppearance
} from "../appearance/AppearanceContext";
import { ApiError, getApiUrl, setApiUrlOverride } from "../api/client";
import { changePassword, User } from "../api/auth";
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
      { label: "Appearance", helper: "Theme, accent, and chat look", icon: Palette },
      { label: "Notifications", helper: "Messages, calls, and quiet hours", icon: Bell },
      { label: "Privacy and Security", helper: "Profile visibility and read receipts", icon: LockKeyhole },
      { label: "Help and About", helper: "Version and support", icon: HelpCircle }
    ]
  }
];

function formatAppearanceHelper(appearance: AppearanceSettings, resolvedThemeMode: string) {
  const themeLabel =
    appearance.themeMode === "system"
      ? (THEME_MODE_OPTIONS.find((option) => option.value === resolvedThemeMode)?.label ??
        resolvedThemeMode)
      : (THEME_MODE_OPTIONS.find((option) => option.value === appearance.themeMode)?.label ??
        appearance.themeMode);
  const accentLabel =
    ACCENT_OPTIONS.find((option) => option.value === appearance.accent)?.label ?? appearance.accent;
  const densityLabel =
    DENSITY_OPTIONS.find((option) => option.value === appearance.density)?.label ?? appearance.density;
  return `${themeLabel} · ${accentLabel} · ${densityLabel}`;
}

const wallpaperTileMeta: Array<{ value: WallpaperChoice; label: string; thumbClass: string }> = [
  { value: "dots", label: "Dots", thumbClass: "appearance-wallpaper-thumb--dots" },
  { value: "paper", label: "Paper", thumbClass: "appearance-wallpaper-thumb--paper" },
  { value: "aurora", label: "Aurora", thumbClass: "appearance-wallpaper-thumb--aurora" },
  { value: "plain", label: "Plain", thumbClass: "appearance-wallpaper-thumb--plain" },
  { value: "custom", label: "Custom", thumbClass: "appearance-wallpaper-thumb--custom" }
];

function AppearanceEditor({
  accessToken,
  displayName,
  onBack,
  backButtonRef
}: {
  accessToken: string | null;
  displayName: string;
  onBack: () => void;
  backButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const { appearance, setAppearance, updateAppearance } = useAppearance();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [wallpaperUploadError, setWallpaperUploadError] = useState<string | null>(null);
  const [isUploadingWallpaper, setIsUploadingWallpaper] = useState(false);
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);
  const baselineRef = useRef(appearance);
  const committedRef = useRef(false);

  useEffect(() => {
    backButtonRef.current?.focus();
  }, [backButtonRef]);

  function discardAndClose() {
    if (!committedRef.current) {
      setAppearance(baselineRef.current);
    }
    onBack();
  }

  function commitAndClose() {
    committedRef.current = true;
    onBack();
  }

  function handleResetConfirm() {
    updateAppearance(DEFAULT_APPEARANCE);
    setResetConfirmOpen(false);
  }

  async function handleCustomWallpaperSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!accessToken || !file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setWallpaperUploadError("Choose an image file (JPEG, PNG, GIF, or WebP).");
      return;
    }
    setIsUploadingWallpaper(true);
    setWallpaperUploadError(null);
    try {
      const uploaded = await uploadFile(accessToken, file);
      updateAppearance({
        wallpaper: "custom",
        customWallpaperFileId: uploaded.id
      });
    } catch (err) {
      setWallpaperUploadError(
        err instanceof ApiError ? String(err.message) : "Could not upload wallpaper"
      );
    } finally {
      setIsUploadingWallpaper(false);
    }
  }

  function selectWallpaper(value: WallpaperChoice) {
    if (value === "custom") {
      if (appearance.customWallpaperFileId) {
        updateAppearance({ wallpaper: "custom" });
        return;
      }
      wallpaperInputRef.current?.click();
      return;
    }
    updateAppearance({ wallpaper: value });
  }

  const previewHero = (
    <div
      className="appearance-preview-hero"
      role="img"
      aria-label="Theme preview"
      data-wallpaper={appearance.wallpaper}
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
            onClick={discardAndClose}
          >
            <ChevronLeft aria-hidden="true" size={22} />
          </button>
          <h2 className="appearance-editor-title" tabIndex={-1}>
            Appearance
          </h2>
        </header>

        <div className="appearance-editor-preview-column">{previewHero}</div>

        <div className="appearance-editor-controls">
          <section className="appearance-section-card">
            <p className="appearance-section-label">Theme</p>
            <div className="appearance-segment appearance-segment--bar" role="tablist" aria-label="Theme mode">
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
          </section>

          <section className="appearance-section-card">
            <p className="appearance-section-label">Accent colour</p>
            <div className="appearance-swatch-row" role="group" aria-label="Accent colour">
              {PRESET_ACCENT_OPTIONS.map((accent) => (
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
              <label
                className={`color-swatch custom appearance-custom-swatch${
                  appearance.accent === "custom" ? " active" : ""
                }`}
                title="Custom color"
                style={{ background: appearance.customAccent }}
              >
                <Palette aria-hidden="true" size={15} strokeWidth={2.25} />
                <span className="visually-hidden">Custom color</span>
                <input
                  type="color"
                  value={appearance.customAccent}
                  aria-label="Custom accent color"
                  onChange={(event) =>
                    updateAppearance({ accent: "custom", customAccent: event.target.value })
                  }
                />
              </label>
            </div>
          </section>

          <section className="appearance-section-card">
            <p className="appearance-section-label">Chat background</p>
            <div className="appearance-wallpaper-grid" role="radiogroup" aria-label="Chat background">
              {wallpaperTileMeta.map((tile) => (
                <button
                  type="button"
                  className={`appearance-wallpaper-tile ${tile.thumbClass}`}
                  role="radio"
                  aria-checked={appearance.wallpaper === tile.value}
                  aria-label={tile.label}
                  title={tile.label}
                  key={tile.value}
                  disabled={isUploadingWallpaper && tile.value === "custom"}
                  onClick={() => selectWallpaper(tile.value)}
                >
                  {tile.value === "custom" ? (
                    <span>{appearance.customWallpaperFileId ? "Photo" : "Upload"}</span>
                  ) : null}
                </button>
              ))}
            </div>
            <input
              ref={wallpaperInputRef}
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="visually-hidden"
              type="file"
              onChange={(event) => void handleCustomWallpaperSelect(event)}
            />
            <div className="appearance-wallpaper-upload-row">
              <button
                type="button"
                className="button-secondary"
                disabled={isUploadingWallpaper || !accessToken}
                onClick={() => wallpaperInputRef.current?.click()}
              >
                {isUploadingWallpaper ? "Uploading…" : "Upload image"}
              </button>
              {appearance.customWallpaperFileId && (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={isUploadingWallpaper}
                  onClick={() =>
                    updateAppearance({
                      wallpaper:
                        appearance.wallpaper === "custom" ? "dots" : appearance.wallpaper,
                      customWallpaperFileId: null
                    })
                  }
                >
                  Remove custom
                </button>
              )}
            </div>
            {wallpaperUploadError && (
              <p className="error-text" role="alert">
                {wallpaperUploadError}
              </p>
            )}
          </section>

          <section className="appearance-section-card appearance-section-card--stack">
            <p className="appearance-section-label">Message style</p>
            <label className="range-field">
              <span className="appearance-inline-row">
                Curvature
                <strong>{appearance.bubbleRadius}px</strong>
              </span>
              <input
                type="range"
                min="4"
                max="24"
                step="1"
                value={appearance.bubbleRadius}
                aria-label="Message bubble curvature"
                onChange={(event) =>
                  updateAppearance({ bubbleRadius: Number(event.target.value) })
                }
              />
            </label>
            <div className="appearance-segment appearance-segment--bar appearance-segment--3" role="group" aria-label="Bubble shape presets">
              {BUBBLE_SHAPE_OPTIONS.map((option) => (
                <button
                  type="button"
                  className={appearance.bubbleShape === option.value ? "active" : ""}
                  aria-pressed={appearance.bubbleShape === option.value}
                  key={option.value}
                  onClick={() => updateAppearance({ bubbleShape: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="appearance-segment appearance-segment--bar appearance-segment--fonts" role="group" aria-label="Message font">
              {MESSAGE_FONT_OPTIONS.map((option) => (
                <button
                  type="button"
                  className={appearance.messageFont === option.value ? "active" : ""}
                  aria-pressed={appearance.messageFont === option.value}
                  key={option.value}
                  style={{ fontFamily: option.family }}
                  onClick={() => updateAppearance({ messageFont: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
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
            <div className="appearance-segment appearance-segment--bar appearance-segment--2" role="group" aria-label="Density">
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
          </section>

          <section className="appearance-section-card appearance-section-card--stack">
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
                  On: Enter sends, Shift+Enter adds a new line. Off: Enter adds a
                  new line, Ctrl/Cmd+Enter sends
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
            className="ghost-button appearance-reset-button"
            onClick={() => setResetConfirmOpen(true)}
          >
            <RotateCcw aria-hidden="true" size={16} />
            Reset appearance
          </button>

          <button type="button" className="appearance-done-button" onClick={commitAndClose}>
            Done
          </button>
        </div>
      </div>

      {resetConfirmOpen && (
        <div
          className="dialog-backdrop"
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
  const { appearance, resolvedThemeMode } = useAppearance();
  const [currentServerUrl] = useState(() => getApiUrl());
  const [family, setFamily] = useState<Family | null>(null);
  const [profileForm, setProfileForm] = useState(() => ({
    displayName: currentUser?.displayName ?? "",
    familyName: "",
    email: currentUser?.email ?? "",
    bio: currentUser?.bio ?? "",
    timezone: currentUser?.timezone || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "")
  }));
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmation: ""
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
  const appearanceHelper = formatAppearanceHelper(appearance, resolvedThemeMode);

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
      const autoTz = currentUser?.timezone || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "");
      setProfileForm({
        displayName: currentUser?.displayName ?? "",
        familyName: familyResult.name,
        email: currentUser?.email ?? "",
        bio: currentUser?.bio ?? "",
        timezone: autoTz
      });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load settings");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authRequest, currentUser?.displayName, currentUser?.email, currentUser?.bio, currentUser?.timezone]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDevicePreferences(patch: Partial<DevicePreferences>) {
    const next = writeDevicePreferences(patch);
    setDevicePreferences(next);
  }

  async function handleAppLockToggle(enabled: boolean) {
    setError(null);
    setNotice(null);
    if (!isAndroidAppLockAvailablePlatform()) return;

    setIsSaving(true);
    try {
      if (enabled) {
        const availability = await getAppLockAvailability();
        if (!availability.available) {
          setError("Set a device PIN, pattern, password, or biometric in Android settings first.");
          return;
        }
        const confirmed = await authenticateAppLock("Confirm to enable App lock");
        if (!confirmed) return;
        updateDevicePreferences({ appLockEnabled: true });
        return;
      }

      const confirmed = await authenticateAppLock("Confirm to disable App lock");
      if (!confirmed) return;
      updateDevicePreferences({ appLockEnabled: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update App lock");
    } finally {
      setIsSaving(false);
    }
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

  async function saveProfile(): Promise<boolean> {
    if (!currentUser) {
      return false;
    }
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const hasUserChanges =
        profileForm.displayName.trim() !== (currentUser.displayName ?? "") ||
        profileForm.email.trim() !== (currentUser.email ?? "") ||
        profileForm.bio.trim() !== (currentUser.bio ?? "") ||
        profileForm.timezone.trim() !== (currentUser.timezone ?? "");

      if (hasUserChanges && profileForm.displayName.trim()) {
        const updatedUser = await authRequest<User>("/api/auth/me", {
          method: "PATCH",
          body: {
            displayName: profileForm.displayName.trim(),
            email: profileForm.email.trim() || "",
            bio: profileForm.bio.trim() || "",
            timezone: profileForm.timezone.trim() || ""
          }
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
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not save profile");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleProfileSubmit(event: FormEvent) {
    event.preventDefault();
    await saveProfile();
  }

  async function handleProfileDone() {
    if (!profileForm.displayName.trim()) {
      return;
    }
    const saved = await saveProfile();
    if (saved) {
      setActiveSettingsItem(null);
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

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    if (passwordForm.newPassword !== passwordForm.confirmation) {
      setError("New password and confirmation do not match");
      return;
    }
    setIsSaving(true);
    try {
      await changePassword(accessToken, {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmation: "" });
      setNotice("Password changed. Other devices have been signed out.");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not change password");
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
            accessToken={accessToken}
            displayName={profileForm.displayName}
            backButtonRef={appearanceBackRef}
            onBack={() => setActiveSettingsItem(null)}
          />
        ) : (
          <>
            {!activeSettingsItem && (
              <>


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
                  <span className="ms-icon ms-icon--24" aria-hidden={true}>
                    add_a_photo
                  </span>
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
                  <span className="role-pill">{currentUser?.role}</span>
                </span>
                <ChevronRight aria-hidden="true" size={18} />
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
                      const isAppearance = item.label === "Appearance";
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
                            <small>{isAppearance ? appearanceHelper : item.helper}</small>
                          </span>
                          <ChevronRight aria-hidden="true" size={18} />
                          {isAppearance && (
                            <div className="settings-appearance-preview" aria-hidden="true">
                              <div className="settings-appearance-preview-chat">
                                <span className="preview-avatar">
                                  {initials(profileForm.displayName)}
                                </span>
                                <div className="preview-thread">
                                  <span className="preview-bubble">Family dinner is at 7.</span>
                                  <span className="preview-bubble mine">I will bring dessert.</span>
                                </div>
                              </div>
                              <div className="settings-appearance-preview-meta">
                                <div className="settings-appearance-preview-swatches">
                                  {ACCENT_OPTIONS.filter((option) => option.value !== "custom").map(
                                    (accent) => (
                                      <span
                                        key={accent.value}
                                        className={`color-swatch ${accent.swatchClassName}${
                                          appearance.accent === accent.value ? " active" : ""
                                        }`}
                                      />
                                    )
                                  )}
                                </div>
                                <span>Tap to personalize</span>
                              </div>
                            </div>
                          )}
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
                onClick={() => {
                  // Leave the auth-gated settings route before clearing the session,
                  // otherwise RequireAuth redirects to /login.
                  navigate("/server-setup", { replace: true });
                  setApiUrlOverride(null);
                  void logout();
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
                    onClick={() => {
                      if (activeSettingsItem === "Privacy and Security" && privacyDetail !== "overview") {
                        setPrivacyDetail("overview");
                        return;
                      }
                      if (activeSettingsItem === "Profile") {
                        setProfileForm({
                          displayName: currentUser?.displayName ?? "",
                          familyName: family?.name ?? "",
                          email: currentUser?.email ?? "",
                          bio: currentUser?.bio ?? "",
                          timezone: currentUser?.timezone || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "")
                        });
                      }
                      setActiveSettingsItem(null);
                    }}
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
                        <button type="button" className="avatar-edit-button" aria-label="Change profile photo" disabled={isSaving} onClick={() => profilePhotoInputRef.current?.click()}><span className="ms-icon ms-icon--24" aria-hidden={true}>add_a_photo</span></button>
                        <input ref={profilePhotoInputRef} accept="image/jpeg,image/png,image/gif,image/webp" className="visually-hidden" disabled={isSaving} type="file" onChange={handleProfilePhotoSelect} />
                      </div>
                      <div><h3>{profileForm.displayName || "Family member"}</h3><span className="role-pill">{currentUser?.role}</span></div>
                    </section>
                    <form className="profile-detail-form" onSubmit={handleProfileSubmit}>
                      <label><span><UserRound aria-hidden="true" size={21} />Display name</span><input maxLength={255} value={profileForm.displayName} onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))} /></label>
                      <label><span><Mail aria-hidden="true" size={21} />Email (optional)</span><input type="email" placeholder="e.g. alex@example.com" maxLength={255} value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} /></label>
                      <label style={{ alignItems: "flex-start" }}><span style={{ paddingTop: "10px" }}><UserRound aria-hidden="true" size={21} />Bio (optional)</span><textarea placeholder="Tell family members a bit about yourself…" maxLength={500} rows={3} value={profileForm.bio} onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))} /></label>
                      <label><span><Clock3 aria-hidden="true" size={21} />Timezone</span><select value={profileForm.timezone} onChange={(event) => setProfileForm((current) => ({ ...current, timezone: event.target.value }))}>{Intl.supportedValuesOf("timeZone").map((tz) => (<option key={tz} value={tz}>{tz}</option>))}</select></label>
                      <label><span><Users aria-hidden="true" size={21} />Family</span><input disabled={!canManageFamily} maxLength={255} value={profileForm.familyName} onChange={(event) => setProfileForm((current) => ({ ...current, familyName: event.target.value }))} /></label>
                      <button type="submit" className="save-button primary-button" disabled={isSaving || !profileForm.displayName.trim()}>{isSaving ? "Saving…" : "Save profile"}</button>
                    </form>
                    <form className="profile-detail-form" onSubmit={handlePasswordSubmit}>
                      <h3>Change password</h3>
                      <p className="muted-copy">This applies only to the account on the currently selected server.</p>
                      <label><span><LockKeyhole aria-hidden="true" size={21} />Current password</span><input type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} required /></label>
                      <label><span><LockKeyhole aria-hidden="true" size={21} />New password</span><input type="password" autoComplete="new-password" minLength={8} value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} required /></label>
                      <label><span><LockKeyhole aria-hidden="true" size={21} />Confirm new password</span><input type="password" autoComplete="new-password" minLength={8} value={passwordForm.confirmation} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmation: event.target.value }))} required /></label>
                      <button type="submit" className="save-button primary-button" disabled={isSaving || !accessToken}>{isSaving ? "Changing…" : "Change password"}</button>
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
                    {isAndroidAppLockAvailablePlatform() && (
                      <label className="privacy-row">
                        <LockKeyhole aria-hidden="true" />
                        <span>
                          <strong>App lock</strong>
                          <small>{devicePreferences.appLockEnabled ? "On" : "Off"}</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={devicePreferences.appLockEnabled}
                          disabled={isSaving}
                          onChange={(event) => void handleAppLockToggle(event.target.checked)}
                        />
                      </label>
                    )}
                    <button type="button" className="privacy-row" onClick={() => setPrivacyDetail("blocked")}><UserRoundX aria-hidden="true" /><span><strong>Blocked members</strong></span><ChevronRight aria-hidden="true" /></button>
                  </div>
                ) : activeSettingsItem === "Privacy and Security" ? (
                  <div className="settings-toggle-groups">
                    {privacyDetail === "blocked" ? (
                      <section className="blocked-members-page">
                        <h3>Blocked members</h3>
                        {members
                          .filter((member) => member.id !== currentUser?.id)
                          .map((member) => {
                            const isBlocked = blockedMemberIds.includes(member.id);
                            return (
                              <div className="settings-row" key={member.id}>
                                <ProfileAvatar
                                  accessToken={accessToken}
                                  file={member.profilePhoto}
                                  label={member.displayName}
                                  size="default"
                                />
                                <span>
                                  <strong>{member.displayName}</strong>
                                  <small>@{member.username}</small>
                                </span>
                                <button
                                  type="button"
                                  className="blocked-member-action"
                                  disabled={isSaving}
                                  onClick={() => void toggleBlock(member)}
                                >
                                  {isBlocked ? "Unblock" : "Block"}
                                </button>
                              </div>
                            );
                          })}
                      </section>
                    ) : (
                      <section className="choice-page">
                        <h3>{privacyDetail === "profile" ? "Profile visibility" : "Last seen"}</h3>
                        {(["family", "nobody"] as const).map((value) => {
                          const selected =
                            (privacyDetail === "profile"
                              ? currentUser?.profileVisibility
                              : currentUser?.lastSeenVisibility) === value;
                          return (
                            <button
                              type="button"
                              className={`privacy-choice${selected ? " is-selected" : ""}`}
                              key={value}
                              onClick={() =>
                                void updatePrivacy(
                                  privacyDetail === "profile"
                                    ? { profileVisibility: value }
                                    : { lastSeenVisibility: value }
                                )
                              }
                            >
                              <span className="privacy-choice-copy">
                                <strong>{value === "family" ? "Family" : "Nobody"}</strong>
                                <small>
                                  {value === "family"
                                    ? "Visible to everyone in your family"
                                    : "Hidden from other members"}
                                </small>
                              </span>
                              {selected && <span className="privacy-choice-check">✓</span>}
                            </button>
                          );
                        })}
                      </section>
                    )}
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
