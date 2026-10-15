import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { startRegistration } from "@simplewebauthn/browser";
import QRCode from "qrcode";
import { BellOff, Clock3, KeyRound, LockKeyhole, Mail, Server, UserRound } from "lucide-react";
import { ApiError, getApiUrl } from "../../api/client";
import { beginPasskeyRegistration, createAndroidQRLogin, finishPasskeyRegistration } from "../../api/auth";
import type { AppStrings } from "../../config/strings";
import type { DevicePreferences } from "../../settings/devicePreferences";
import { useResolvedLanguage } from "../../i18n/LanguageContext";

export type ProfileForm = {
  displayName: string;
  email: string;
  bio: string;
  timezone: string;
};

export type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
};

type Props = {
  strings: AppStrings;
  profileForm: ProfileForm;
  setProfileForm: Dispatch<SetStateAction<ProfileForm>>;
  passwordForm: PasswordForm;
  setPasswordForm: Dispatch<SetStateAction<PasswordForm>>;
  isSaving: boolean;
  accessToken: string | null;
  role?: string;
  username?: string;
  currentServerUrl: string;
  connectionLink: string;
  profilePhotoControl: ReactNode;
  notificationPreferences: Pick<DevicePreferences, "quietHoursEnabled" | "quietHoursStart" | "quietHoursEnd">;
  onProfileSubmit: (event: FormEvent) => void;
  onPasswordSubmit: (event: FormEvent) => void;
  onCopyConnection: () => void;
  onNotificationPreferencesUpdate: (updates: Partial<DevicePreferences>) => void;
};

export function ProfileSettingsTab(props: Props) {
  const { strings, profileForm, setProfileForm, passwordForm, setPasswordForm, isSaving, accessToken, role, username, currentServerUrl, connectionLink, profilePhotoControl, notificationPreferences, onProfileSubmit, onPasswordSubmit, onCopyConnection, onNotificationPreferencesUpdate } = props;
  const language = useResolvedLanguage();
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState("");
  const [androidQR, setAndroidQR] = useState<{ image: string; expiresAt: string } | null>(null);
  const [androidQRBusy, setAndroidQRBusy] = useState(false);
  const [androidQRError, setAndroidQRError] = useState("");
  async function generateAndroidQR() {
    if (!accessToken || androidQRBusy) return;
    setAndroidQRBusy(true);
    setAndroidQRError("");
    setAndroidQR(null);
    try {
      const apiUrl = getApiUrl();
      const grant = await createAndroidQRLogin(accessToken);
      const payload = `stovo://auth/android-login?version=1&apiUrl=${encodeURIComponent(apiUrl)}&code=${encodeURIComponent(grant.requestId)}`;
      const image = await QRCode.toDataURL(payload, { width: 256, margin: 2 });
      setAndroidQR({ image, expiresAt: grant.expiresAt });
    } catch (err) {
      setAndroidQRError(err instanceof ApiError ? String(err.message) : strings.security.androidQrCreateFailed);
    } finally {
      setAndroidQRBusy(false);
    }
  }
  const passkeyUnavailable = (Capacitor.isNativePlatform() && Capacitor.getPlatform() !== "android") || !window.isSecureContext || typeof window.PublicKeyCredential === "undefined";
  async function addPasskey() {
    if (!accessToken || passkeyUnavailable || passkeyBusy) return;
    setPasskeyBusy(true);
    setPasskeyMessage("");
    try {
      const ceremony = await beginPasskeyRegistration(accessToken);
      const credential = await startRegistration({ optionsJSON: ceremony.publicKey as never });
      await finishPasskeyRegistration(accessToken, ceremony.ceremonyId, credential);
      setPasskeyMessage(strings.security.passkeyAdded);
    } catch (err) {
      if (!((err instanceof Error || err instanceof DOMException) && ["NotAllowedError", "AbortError"].includes(err.name))) {
        setPasskeyMessage(err instanceof ApiError ? String(err.message) : strings.security.addPasskeyFailed);
      }
    } finally {
      setPasskeyBusy(false);
    }
  }
  return (
    <div className="profile-detail-screen">
      <section className="profile-detail-hero">
        <div className="profile-detail-avatar-wrap">{profilePhotoControl}</div>
        <div><h3>{profileForm.displayName || strings.settings.familyMember}</h3><span className="role-pill">{role}</span></div>
      </section>
      <form className="profile-detail-form" onSubmit={onProfileSubmit}>
        <label><span><UserRound aria-hidden="true" size={21} />{strings.settings.displayName}</span><input maxLength={255} value={profileForm.displayName} onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))} /></label>
        <label><span><Mail aria-hidden="true" size={21} />{strings.settings.emailOptional}</span><input type="email" placeholder={strings.settings.emailPlaceholder} maxLength={255} value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} /></label>
        <label style={{ alignItems: "flex-start" }}><span style={{ paddingTop: "10px" }}><UserRound aria-hidden="true" size={21} />{strings.settings.bioOptional}</span><textarea placeholder={strings.settings.bioPlaceholder} maxLength={500} rows={3} value={profileForm.bio} onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))} /></label>
        <label><span><Clock3 aria-hidden="true" size={21} />{strings.settings.timezone}</span><select value={profileForm.timezone} onChange={(event) => setProfileForm((current) => ({ ...current, timezone: event.target.value }))}>{Intl.supportedValuesOf("timeZone").map((tz) => <option key={tz} value={tz}>{tz}</option>)}</select></label>
        <button type="submit" className="save-button primary-button" disabled={isSaving || !profileForm.displayName.trim()}>{isSaving ? strings.settings.savingEllipsis : strings.settings.saveProfile}</button>
      </form>
      <form className="profile-detail-form" onSubmit={onPasswordSubmit}>
        <h3>{strings.settings.changePassword}</h3><p className="muted-copy">{strings.settings.changePasswordNote}</p>
        <label><span><LockKeyhole aria-hidden="true" size={21} />{strings.settings.currentPassword}</span><input type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} required /></label>
        <label><span><LockKeyhole aria-hidden="true" size={21} />{strings.settings.newPassword}</span><input type="password" autoComplete="new-password" minLength={8} value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} required /></label>
        <label><span><LockKeyhole aria-hidden="true" size={21} />{strings.settings.confirmNewPassword}</span><input type="password" autoComplete="new-password" minLength={8} value={passwordForm.confirmation} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmation: event.target.value }))} required /></label>
        <button type="submit" className="save-button primary-button" disabled={isSaving || !accessToken}>{isSaving ? strings.settings.changing : strings.settings.changePassword}</button>
      </form>
      <section className="profile-detail-form">
        <h3><KeyRound aria-hidden="true" size={20} /> {strings.security.passkeys}</h3>
        <p className="muted-copy">{strings.security.passkeyDescription}</p>
        <button type="button" className="save-button primary-button" onClick={() => void addPasskey()} disabled={!accessToken || passkeyUnavailable || passkeyBusy || isSaving}>{passkeyBusy ? strings.security.addingPasskey : strings.security.addPasskey}</button>
        {passkeyUnavailable && <p className="muted-copy">{strings.security.passkeyUnsupported}</p>}
        {passkeyMessage && <p role="status" className="muted-copy">{passkeyMessage}</p>}
      </section>
      {!Capacitor.isNativePlatform() && <section className="profile-detail-form">
        <h3>{strings.security.androidQrTitle}</h3>
        <p className="muted-copy">{strings.security.androidQrDescription}</p>
        <button type="button" className="save-button primary-button" onClick={() => void generateAndroidQR()} disabled={!accessToken || androidQRBusy || isSaving}>{androidQRBusy ? strings.security.androidQrCreating : androidQR ? strings.security.androidQrRegenerate : strings.security.androidQrCreate}</button>
        {androidQR && <div aria-live="polite">
          <img className="android-qr-code" src={androidQR.image} alt={strings.security.androidQrAlt} width={256} height={256} style={{ maxWidth: "100%", height: "auto" }} />
          <p className="muted-copy">{strings.security.expires} <time dateTime={androidQR.expiresAt}>{new Date(androidQR.expiresAt).toLocaleString(language)}</time></p>
        </div>}
        {androidQRError && <p role="alert" className="muted-copy">{androidQRError}</p>}
      </section>}
      <section className="profile-detail-form profile-notification-schedule">
        <h3>{strings.notifications.quietHours}</h3>
        <label className="profile-notification-toggle">
          <span className="profile-notification-toggle-copy">
            <BellOff aria-hidden="true" size={21} />
            <span>
              <strong>{strings.notifications.muteNotifications}</strong>
              <span className="appearance-toggle-help">{notificationPreferences.quietHoursStart} — {notificationPreferences.quietHoursEnd}</span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={notificationPreferences.quietHoursEnabled}
            onChange={(event) => onNotificationPreferencesUpdate({ quietHoursEnabled: event.target.checked })}
          />
        </label>
        <div className="profile-quiet-hours-times">
          <label className="profile-time-field"><span>{strings.notifications.start}</span><input aria-label={strings.notifications.quietHoursStartAria} type="time" value={notificationPreferences.quietHoursStart} onChange={(event) => onNotificationPreferencesUpdate({ quietHoursStart: event.target.value })} /></label>
          <label className="profile-time-field"><span>{strings.notifications.end}</span><input aria-label={strings.notifications.quietHoursEndAria} type="time" value={notificationPreferences.quietHoursEnd} onChange={(event) => onNotificationPreferencesUpdate({ quietHoursEnd: event.target.value })} /></label>
        </div>
      </section>
      <section className="profile-detail-form connection-export">
        <h3>{strings.settings.connectAndroidDevice}</h3><p className="muted-copy">{strings.settings.androidLinkNote}</p>
        <label><span><Server aria-hidden="true" size={21} />{strings.settings.server}</span><input readOnly value={currentServerUrl} /></label>
        <label><span><UserRound aria-hidden="true" size={21} />{strings.settings.login}</span><input readOnly value={username ?? ""} /></label>
        {connectionLink && <label><span>{strings.settings.androidLink}</span><input readOnly value={connectionLink} onFocus={(event) => event.currentTarget.select()} /></label>}
        <button type="button" className="save-button primary-button" onClick={onCopyConnection}>{strings.settings.copyConnectionLink}</button>
      </section>
    </div>
  );
}
