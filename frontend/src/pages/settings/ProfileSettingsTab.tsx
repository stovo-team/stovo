import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { Clock3, LockKeyhole, Mail, Server, UserRound, Users } from "lucide-react";
import type { AppStrings } from "../../config/strings";

export type ProfileForm = {
  displayName: string;
  familyName: string;
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
  canManageFamily: boolean;
  isSaving: boolean;
  accessToken: string | null;
  role?: string;
  username?: string;
  currentServerUrl: string;
  connectionLink: string;
  profilePhotoControl: ReactNode;
  onProfileSubmit: (event: FormEvent) => void;
  onPasswordSubmit: (event: FormEvent) => void;
  onCopyConnection: () => void;
};

export function ProfileSettingsTab(props: Props) {
  const { strings, profileForm, setProfileForm, passwordForm, setPasswordForm, canManageFamily, isSaving, accessToken, role, username, currentServerUrl, connectionLink, profilePhotoControl, onProfileSubmit, onPasswordSubmit, onCopyConnection } = props;
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
        <label><span><Users aria-hidden="true" size={21} />{strings.settings.family}</span><input disabled={!canManageFamily} maxLength={255} value={profileForm.familyName} onChange={(event) => setProfileForm((current) => ({ ...current, familyName: event.target.value }))} /></label>
        <button type="submit" className="save-button primary-button" disabled={isSaving || !profileForm.displayName.trim()}>{isSaving ? strings.settings.savingEllipsis : strings.settings.saveProfile}</button>
      </form>
      <form className="profile-detail-form" onSubmit={onPasswordSubmit}>
        <h3>{strings.settings.changePassword}</h3><p className="muted-copy">{strings.settings.changePasswordNote}</p>
        <label><span><LockKeyhole aria-hidden="true" size={21} />{strings.settings.currentPassword}</span><input type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} required /></label>
        <label><span><LockKeyhole aria-hidden="true" size={21} />{strings.settings.newPassword}</span><input type="password" autoComplete="new-password" minLength={8} value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} required /></label>
        <label><span><LockKeyhole aria-hidden="true" size={21} />{strings.settings.confirmNewPassword}</span><input type="password" autoComplete="new-password" minLength={8} value={passwordForm.confirmation} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmation: event.target.value }))} required /></label>
        <button type="submit" className="save-button primary-button" disabled={isSaving || !accessToken}>{isSaving ? strings.settings.changing : strings.settings.changePassword}</button>
      </form>
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
