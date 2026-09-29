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
  BarChart3,
  ChevronRight,
  Database,
  Globe,
  SlidersHorizontal,
  HelpCircle,
  Keyboard,
  Laptop,
  LockKeyhole,
  LogOut,
  Palette,
  RotateCcw,
  Shield,
  Users,
  X
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage, useStrings } from "../i18n/LanguageContext";
import type { AppStrings, LanguageChoice } from "../config/strings";


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
import { ApiError, getApiUrl } from "../api/client";
import { beginPasskeyRegistration, changePassword, finishPasskeyRegistration, User } from "../api/auth";
import { startRegistration } from "@simplewebauthn/browser";
import { Capacitor } from "@capacitor/core";
import { createConnectionLink } from "../connectionLink";
import { Family, getMembers } from "../api/family";
import { FamilyFile, uploadFile } from "../api/files";
import { useAuth } from "../auth/AuthContext";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import {
  DevicePreferences,
  readDevicePreferences,
  writeDevicePreferences
} from "../settings/devicePreferences";
import { updateNativeNotificationSchedule } from "../api/notifications";
import { AvatarEditorModal } from "../components/AvatarEditorModal";
import { BackButton } from "../components/BackButton";
import AppNav from "./AppNav";
import { NotificationsSettings } from "./settings/NotificationsSettings";
import { LanguageSettings } from "./settings/LanguageSettings";
import { ProfileSettingsTab } from "./settings/ProfileSettingsTab";
import { PrivacySecuritySettings, type PrivacyDetail } from "./settings/PrivacySecuritySettings";
import { AppearanceEditor } from "./settings/AppearanceEditor";
import { FamilySettings } from "./settings/FamilySettings";
import { SettingsAvatar } from "./settings/SettingsAvatar";
import { KeyboardShortcutsSettings } from "./settings/KeyboardShortcutsSettings";
import { GeneralSettings } from "./settings/GeneralSettings";
import { HelpAboutSection } from "./settings/HelpAboutSection";
import { SettingsDashboard, type SettingsDashboardGroup } from "./settings/SettingsDashboard";
import { resetAllShortcutBindings } from "../shortcuts/shortcutsStore";

function initials(name: string | undefined) {
  return (name ?? "Stovo")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase())
    .join("");
}

function formatAppearanceHelper(
  appearance: AppearanceSettings,
  resolvedThemeMode: string,
  strings: AppStrings
) {
  const themeKey = appearance.themeMode === "system" ? resolvedThemeMode : appearance.themeMode;
  const themeLabel =
    strings.appearance.themes[themeKey as keyof typeof strings.appearance.themes] ??
    (THEME_MODE_OPTIONS.find((option) => option.value === themeKey)?.label ?? themeKey);
  const accentLabel =
    strings.appearance.accents[appearance.accent] ??
    (ACCENT_OPTIONS.find((option) => option.value === appearance.accent)?.label ?? appearance.accent);
  const densityLabel =
    strings.appearance.densities[appearance.density] ??
    (DENSITY_OPTIONS.find((option) => option.value === appearance.density)?.label ?? appearance.density);
  return `${themeLabel} · ${accentLabel} · ${densityLabel}`;
}

export default function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { accessToken, authRequest, currentUser, logout, updateCurrentUser } = useAuth();
  const { appearance, resolvedThemeMode } = useAppearance();
  const [currentServerUrl] = useState(() => getApiUrl());
  const [family, setFamily] = useState<Family | null>(null);
  const [profileForm, setProfileForm] = useState(() => ({
    displayName: currentUser?.displayName ?? "",
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
  const [activeSettingsItem, setActiveSettingsItem] = useState<string | null>(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("family")) return "Family";
    if (params.get("section") === "shortcuts" || params.has("shortcuts")) return "Shortcuts";
    if (params.get("section") === "help-about") return "Help and About";
    return null;
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("section") === "shortcuts" || params.has("shortcuts")) {
      setActiveSettingsItem("Shortcuts");
    } else if (params.has("family")) {
      setActiveSettingsItem("Family");
    } else if (params.get("section") === "help-about") {
      setActiveSettingsItem("Help and About");
    }
  }, [location.search]);

  useEffect(() => {
    function handleOpenShortcuts() {
      setActiveSettingsItem("Shortcuts");
    }
    window.addEventListener("stovo:open-shortcuts-settings", handleOpenShortcuts);
    return () => {
      window.removeEventListener("stovo:open-shortcuts-settings", handleOpenShortcuts);
    };
  }, []);
  const [devicePreferences, setDevicePreferences] = useState<DevicePreferences>(() =>
    readDevicePreferences()
  );
  const [members, setMembers] = useState<User[]>([]);
  const [blockedMemberIds, setBlockedMemberIds] = useState<string[]>([]);
  const [privacyDetail, setPrivacyDetail] = useState<PrivacyDetail>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProfilePhotoFile, setEditingProfilePhotoFile] = useState<File | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const appearanceBackRef = useRef<HTMLButtonElement | null>(null);

  const { language, setLanguage, systemLanguage, resolvedLanguage, strings } = useLanguage();
  const canManageFamily = currentUser?.role === "owner" || currentUser?.role === "admin";
  const isAppearanceEditor = activeSettingsItem === "Appearance";
  const hasDetailSurface = Boolean(activeSettingsItem);
  const appearanceHelper = formatAppearanceHelper(appearance, resolvedThemeMode, strings);

  const languageHelper =
    language === "system"
      ? `${strings.settings.languageSystem} (${systemLanguage === "ru" ? strings.settings.languageRussian : strings.settings.languageEnglish})`
      : language === "ru"
      ? strings.settings.languageRussian
      : strings.settings.languageEnglish;

  const getActiveSettingsItemTitle = (item: string) => {
    switch (item) {
      case "General":
        return strings.settings.general;
      case "Appearance":
        return strings.settings.appearance;
      case "Notifications":
        return strings.settings.notifications;
      case "Shortcuts":
        return strings.settings.keyboardShortcuts;
      case "Privacy and Security":
        return strings.settings.privacyAndSecurity;
      case "Language":
        return strings.settings.language;
      case "Help and About":
        return strings.settings.helpAndAbout;
      case "Profile":
        return strings.settings.displayName;
      case "Family":
        return strings.settings.family;
      case "Statistics":
        return strings.settings.statistics;
      default:
        return item;
    }
  };

  const settingsGroups = [
    {
      title: strings.settings.yourSpace,
      items: [
        { id: "General", label: strings.settings.general, helper: strings.settings.generalHelper, icon: SlidersHorizontal },
        { id: "Appearance", label: strings.settings.appearance, helper: appearanceHelper, icon: Palette },
        { id: "Notifications", label: strings.settings.notifications, helper: strings.settings.notificationsHelper, icon: Bell },
        { id: "Privacy and Security", label: strings.settings.privacyAndSecurity, helper: strings.settings.privacyHelper, icon: LockKeyhole },
        { id: "Shortcuts", label: strings.settings.keyboardShortcuts, helper: strings.settings.keyboardShortcutsHelper, icon: Keyboard },
        { id: "Language", label: strings.settings.language, helper: languageHelper, icon: Globe },
        { id: "Statistics", label: strings.settings.statistics, helper: strings.settings.statisticsHelper, icon: BarChart3 },
        { id: "Help and About", label: strings.settings.helpAndAbout, helper: strings.settings.helpHelper, icon: HelpCircle }
      ]
    }
  ];


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
        email: currentUser?.email ?? "",
        bio: currentUser?.bio ?? "",
        timezone: autoTz
      });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.errors.couldNotLoadSettings);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authRequest, currentUser?.displayName, currentUser?.email, currentUser?.bio, currentUser?.timezone, strings.errors.couldNotLoadSettings]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDevicePreferences(patch: Partial<DevicePreferences>) {
    const next = writeDevicePreferences(patch);
    setDevicePreferences(next);
    if ("quietHoursEnabled" in patch || "quietHoursStart" in patch || "quietHoursEnd" in patch) {
      void updateNativeNotificationSchedule(next);
    }
    if (patch.language) {
      setLanguage(patch.language);
    }
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
          setError(strings.errors.pinRequired);
          return;
        }
        const confirmed = await authenticateAppLock(strings.privacy.confirmEnableAppLock);
        if (!confirmed) return;
        updateDevicePreferences({ appLockEnabled: true });
        return;
      }

      const confirmed = await authenticateAppLock(strings.privacy.confirmDisableAppLock);
      if (!confirmed) return;
      updateDevicePreferences({ appLockEnabled: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.errors.couldNotUpdateAppLock);
    } finally {
      setIsSaving(false);
    }
  }

  async function updatePrivacy(patch: Partial<Pick<User, "profileVisibility" | "lastSeenVisibility" | "readReceiptsEnabled" | "directMessagePermission" | "groupInvitePermission" | "channelInvitePermission" | "voiceInvitePermission" | "invitePermissionUserIds">>) {
    if (!currentUser) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await authRequest<User>("/api/auth/me", { method: "PATCH", body: patch });
      updateCurrentUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.errors.couldNotUpdatePrivacySettings);
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
      setError(err instanceof ApiError ? String(err.message) : strings.errors.couldNotUpdateBlockedMembers);
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
      setNotice(strings.settings.profileSaved);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.errors.couldNotSaveProfile);
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

  function handleProfilePhotoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }
    setError(null);
    setNotice(null);
    setEditingProfilePhotoFile(file);
  }

  async function handleSaveCroppedProfilePhoto(croppedFile: File) {
    if (!accessToken) return;
    setEditingProfilePhotoFile(null);
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const uploaded = await uploadFile(accessToken, croppedFile);
      const updatedUser = await authRequest<User>("/api/auth/me", {
        method: "PATCH",
        body: { profilePhotoFileId: uploaded.id }
      });
      updateCurrentUser(updatedUser);
      setNotice(strings.settings.profilePhotoUpdated);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.errors.couldNotUpdateProfilePhoto);
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
      setError(strings.errors.passwordMismatch);
      return;
    }
    setIsSaving(true);
    try {
      await changePassword(accessToken, {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmation: "" });
      setNotice(strings.settings.passwordChanged);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.errors.couldNotChangePassword);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRegisterPasskey() {
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const ceremony = await beginPasskeyRegistration(accessToken);
      const credential = await startRegistration({ optionsJSON: ceremony.publicKey as never });
      await finishPasskeyRegistration(accessToken, ceremony.ceremonyId, credential);
      setNotice("Passkey added. You can now use it to sign in on the web.");
    } catch (err) {
      if (!(err instanceof Error && ["NotAllowedError", "AbortError"].includes(err.name))) {
        setError(err instanceof ApiError ? String(err.message) : "Could not add passkey. Try again over HTTPS.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  const connectionLink = currentUser ? createConnectionLink({ serverUrl: currentServerUrl, username: currentUser.username }) : "";

  async function copyConnectionCredentials() {
    if (!currentUser) return;
    const text = `Server: ${currentServerUrl}\nLogin: ${currentUser.username}\n\nOpen in Stovo: ${connectionLink}`;
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setNotice(strings.settings.connectionLinkCopied);
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


            <SettingsDashboard
              strings={strings}
              profileName={profileForm.displayName}
              role={currentUser?.role}
              groups={settingsGroups as SettingsDashboardGroup[]}
              appearance={appearance}
              appearanceHelper={appearanceHelper}
              onOpen={(item) => item === "Statistics" ? navigate("statistics") : setActiveSettingsItem(item)}
              profilePhotoControl={<><SettingsAvatar accessToken={accessToken} file={currentUser?.profilePhoto} label={profileForm.displayName || strings.settings.familyMember} /><button type="button" className="avatar-edit-button" aria-label={strings.settings.changeProfilePhoto} title={strings.settings.changeProfilePhoto} disabled={isSaving} onClick={() => profilePhotoInputRef.current?.click()}><span className="ms-icon ms-icon--24" aria-hidden={true}>add_a_photo</span></button><input ref={profilePhotoInputRef} accept="image/jpeg,image/png,image/gif,image/webp" className="visually-hidden" disabled={isSaving} type="file" onChange={handleProfilePhotoSelect} /></>}
            />
              </>
            )}

            {activeSettingsItem && activeSettingsItem !== "Appearance" && (
              <section
                className="settings-detail-panel"
                role="region"
                aria-label={getActiveSettingsItemTitle(activeSettingsItem)}
              >
                <div className="section-title-row">
                  <BackButton
                    ariaLabel={strings.settings.closeSettingsPanel}
                    onClick={() => {
                      if (activeSettingsItem === "Privacy and Security" && privacyDetail !== "overview") {
                        setPrivacyDetail("overview");
                        return;
                      }
                      if (activeSettingsItem === "Profile") {
                        setProfileForm({
                          displayName: currentUser?.displayName ?? "",
                          email: currentUser?.email ?? "",
                          bio: currentUser?.bio ?? "",
                          timezone: currentUser?.timezone || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "")
                        });
                      }
                      setActiveSettingsItem(null);
                      if (location.search) {
                        navigate(location.pathname, { replace: true });
                      }
                    }}
                  />
                  <h2>
                    {getActiveSettingsItemTitle(activeSettingsItem)}
                  </h2>
                  {activeSettingsItem === "Shortcuts" && (
                    <button
                      type="button"
                      className="secondary-button subtle-button shortcuts-reset-all-btn"
                      onClick={() => {
                        if (window.confirm(strings.shortcuts.resetConfirm)) {
                          resetAllShortcutBindings();
                        }
                      }}
                    >
                      <RotateCcw size={15} aria-hidden="true" />
                      <span>{strings.shortcuts.resetAll}</span>
                    </button>
                  )}
                </div>

                {activeSettingsItem === "Profile" ? (
                  <ProfileSettingsTab
                    strings={strings}
                    profileForm={profileForm}
                    setProfileForm={setProfileForm}
                    passwordForm={passwordForm}
                    setPasswordForm={setPasswordForm}
                    isSaving={isSaving}
                    accessToken={accessToken}
                    role={currentUser?.role}
                    username={currentUser?.username}
                    currentServerUrl={currentServerUrl}
                    connectionLink={connectionLink}
                    notificationPreferences={devicePreferences}
                    onProfileSubmit={handleProfileSubmit}
                    onPasswordSubmit={handlePasswordSubmit}
                    onRegisterPasskey={() => void handleRegisterPasskey()}
                    passkeyUnavailable={Capacitor.isNativePlatform() || !window.isSecureContext || typeof window.PublicKeyCredential === "undefined"}
                    onCopyConnection={() => void copyConnectionCredentials()}
                    onNotificationPreferencesUpdate={updateDevicePreferences}
                    profilePhotoControl={
                      <>
                        <SettingsAvatar accessToken={accessToken} file={currentUser?.profilePhoto} label={profileForm.displayName || strings.settings.familyMember} size="lg" />
                        <button type="button" className="avatar-edit-button" aria-label={strings.settings.changeProfilePhoto} disabled={isSaving} onClick={() => profilePhotoInputRef.current?.click()}><span className="ms-icon ms-icon--24" aria-hidden={true}>add_a_photo</span></button>
                        <input ref={profilePhotoInputRef} accept="image/jpeg,image/png,image/gif,image/webp" className="visually-hidden" disabled={isSaving} type="file" onChange={handleProfilePhotoSelect} />
                      </>
                    }
                  />                ) : activeSettingsItem === "General" ? (
                  <GeneralSettings strings={strings} />
                ) : activeSettingsItem === "Notifications" ? (
                  <NotificationsSettings
                    strings={strings}
                    preferences={devicePreferences}
                    onUpdate={updateDevicePreferences}
                  />
                ) : activeSettingsItem === "Privacy and Security" ? (
                  <PrivacySecuritySettings
                    strings={strings}
                    currentUser={currentUser}
                    members={members}
                    blockedMemberIds={blockedMemberIds}
                    detail={privacyDetail}
                    isSaving={isSaving}
                    appLockEnabled={devicePreferences.appLockEnabled}
                    canUseAppLock={isAndroidAppLockAvailablePlatform()}
                    onDetailChange={setPrivacyDetail}
                    onUpdatePrivacy={(patch) => void updatePrivacy(patch)}
                    onAppLockChange={(enabled) => void handleAppLockToggle(enabled)}
                    onToggleBlock={(member) => void toggleBlock(member)}
                    renderMemberAvatar={(member) => <SettingsAvatar accessToken={accessToken} file={member.profilePhoto} label={member.displayName} size="default" />}
                  />
                ) : activeSettingsItem === "Shortcuts" ? (
                  <KeyboardShortcutsSettings />
                ) : activeSettingsItem === "Language" ? (
                  <LanguageSettings
                    strings={strings}
                    language={language}
                    systemLanguage={systemLanguage}
                    onChange={(value) => updateDevicePreferences({ language: value })}
                  />
                ) : activeSettingsItem === "Family" ? (
                  <FamilySettings strings={strings} members={members} canManageFamily={canManageFamily} />
                ) : activeSettingsItem === "Help and About" ? (
                  <HelpAboutSection language={resolvedLanguage} />
                ) : (
                  <p className="muted-copy">
                    {strings.settings.sectionComingSoon}
                  </p>
                )}

              </section>
            )}

            {!activeSettingsItem && (
              <>
            <button className="logout-row" type="button" onClick={() => void logout()}>
              <LogOut aria-hidden="true" size={20} />
              {strings.settings.logOut}
            </button>
              </>
            )}

          </>
        )}
      </section>
      {editingProfilePhotoFile && (
        <AvatarEditorModal
          file={editingProfilePhotoFile}
          onClose={() => setEditingProfilePhotoFile(null)}
          onSave={handleSaveCroppedProfilePhoto}
        />
      )}
    </main>
  );
}
