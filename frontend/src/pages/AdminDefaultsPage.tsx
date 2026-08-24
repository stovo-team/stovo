import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, getClusterPrefix } from "../api/client";
import type { Family } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { useStrings } from "../i18n/LanguageContext";
import { DEFAULT_DEVICE_PREFERENCES, type DevicePreferences } from "../settings/devicePreferences";

function notificationDefaults(family: Family | null): DevicePreferences {
  try {
    return { ...DEFAULT_DEVICE_PREFERENCES, ...JSON.parse(family?.defaultNotificationSettings ?? "{}") };
  } catch {
    return DEFAULT_DEVICE_PREFERENCES;
  }
}

export default function AdminDefaultsPage() {
  const strings = useStrings();
  const { accessToken, authRequest, currentUser } = useAuth();
  const prefix = getClusterPrefix();
  const isOwner = currentUser?.role === "owner";
  const [family, setFamily] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !isOwner) return;
    try {
      setFamily(await authRequest<Family>("/api/family"));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.admin.defaults.loadError);
    }
  }, [accessToken, authRequest, isOwner, strings.admin.defaults.loadError]);

  useEffect(() => void load(), [load]);

  async function save(patch: Partial<Family>) {
    setIsSaving(true); setError(null); setNotice(null);
    try {
      const updated = await authRequest<Family>("/api/family", { method: "PATCH", body: patch });
      setFamily(updated); setNotice(strings.admin.defaults.saved);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.admin.defaults.saveError);
    } finally { setIsSaving(false); }
  }

  const notifications = notificationDefaults(family);
  const setNotifications = (updates: Partial<DevicePreferences>) => void save({ defaultNotificationSettings: JSON.stringify({ ...notifications, ...updates }) });
  const notificationOptions = [
    ["messageNotifications", strings.notifications.messageNotifications], ["messagePreview", strings.notifications.messagePreview], ["messageSound", strings.notifications.messageSound], ["callNotifications", strings.notifications.callNotifications], ["ringtoneEnabled", strings.notifications.ringtoneEnabled]
  ] as const;

  return <main className="app-shell app-frame admin-page admin-detail-page">
    <AppNav />
    <section className="page-surface admin-surface">
      <div className="admin-detail-header"><Link to={`${prefix}/app/admin`} className="mobile-back-button" aria-label={strings.admin.backToAdmin}><span className="ms-icon ms-icon--22" aria-hidden="true">arrow_back</span></Link><h1>{strings.admin.defaults.title}</h1></div>
      {!isOwner && <p className="error-text">{strings.admin.defaults.ownerRequired}</p>}
      {error && <p className="error-text">{error}</p>}{notice && <p className="success-text">{notice}</p>}
      {isOwner && <div className="settings-toggle-groups admin-panel">
        <section><h2>{strings.admin.defaults.privacy}</h2><p>{strings.admin.defaults.privacyHelp}</p>
          <label className="appearance-setting-row"><span><strong>{strings.privacy.profileVisibility}</strong></span><select value={family?.defaultProfileVisibility ?? "family"} disabled={!family || isSaving} onChange={(event) => void save({ defaultProfileVisibility: event.target.value as "family" | "nobody" })}><option value="family">{strings.privacy.family}</option><option value="nobody">{strings.privacy.nobody}</option></select></label>
          <label className="appearance-setting-row"><span><strong>{strings.privacy.lastSeen}</strong></span><select value={family?.defaultLastSeenVisibility ?? "family"} disabled={!family || isSaving} onChange={(event) => void save({ defaultLastSeenVisibility: event.target.value as "family" | "nobody" })}><option value="family">{strings.privacy.family}</option><option value="nobody">{strings.privacy.nobody}</option></select></label>
          <label className="appearance-setting-row"><span><strong>{strings.privacy.readReceipts}</strong></span><input type="checkbox" checked={family?.defaultReadReceiptsEnabled ?? true} disabled={!family || isSaving} onChange={(event) => void save({ defaultReadReceiptsEnabled: event.target.checked })} /></label>
        </section>
        <section><h2>{strings.admin.defaults.notifications}</h2><p>{strings.admin.defaults.notificationsHelp}</p>
          {notificationOptions.map(([key, label]) => <label className="appearance-setting-row" key={key}><strong>{label}</strong><input type="checkbox" checked={notifications[key]} disabled={!family || isSaving} onChange={(event) => setNotifications({ [key]: event.target.checked })} /></label>)}
          <label className="appearance-setting-row"><span><strong>{strings.notifications.muteNotifications}</strong></span><input type="checkbox" checked={notifications.quietHoursEnabled} disabled={!family || isSaving} onChange={(event) => setNotifications({ quietHoursEnabled: event.target.checked })} /></label>
          <div className="quiet-hours-times"><label>{strings.notifications.start}<input type="time" value={notifications.quietHoursStart} disabled={!family || isSaving} onChange={(event) => setNotifications({ quietHoursStart: event.target.value })} /></label><label>{strings.notifications.end}<input type="time" value={notifications.quietHoursEnd} disabled={!family || isSaving} onChange={(event) => setNotifications({ quietHoursEnd: event.target.value })} /></label></div>
        </section>
      </div>}
    </section>
  </main>;
}
