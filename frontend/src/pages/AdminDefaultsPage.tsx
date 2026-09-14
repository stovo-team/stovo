import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, CheckCheck, Clock3, Eye, Music, Phone, Sliders, UserRound, Volume2 } from "lucide-react";

import { ApiError, getClusterPrefix } from "../api/client";
import type { Family } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";
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
  const [screenShareBitrateKbps, setScreenShareBitrateKbps] = useState("5000");

  const load = useCallback(async () => {
    if (!accessToken || !isOwner) return;
    try {
      setFamily(await authRequest<Family>("/api/family"));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.admin.defaults.loadError);
    }
  }, [accessToken, authRequest, isOwner, strings.admin.defaults.loadError]);

  useEffect(() => void load(), [load]);
  useEffect(() => { if (family) setScreenShareBitrateKbps(String(family.screenShareBitrateKbps ?? 5000)); }, [family]);

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
    ["messageNotifications", strings.notifications.messageNotifications, Bell],
    ["messagePreview", strings.notifications.messagePreview, Eye],
    ["messageSound", strings.notifications.messageSound, Volume2],
    ["callNotifications", strings.notifications.callNotifications, Phone],
    ["ringtoneEnabled", strings.notifications.ringtoneEnabled, Music]
  ] as const;

  return <main className="app-shell app-frame admin-page admin-detail-page">
    <AppNav />
    <section className="page-surface admin-surface">
      <div className="admin-detail-header"><BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel={strings.admin.backToAdmin} /><h1>{strings.admin.defaults.title}</h1></div>
      {!isOwner && <p className="error-text">{strings.admin.defaults.ownerRequired}</p>}
      {error && <p className="error-text">{error}</p>}{notice && <p className="success-text">{notice}</p>}
      {isOwner && <div className="settings-toggle-groups admin-panel">
        <section><h2>{strings.admin.defaults.privacy}</h2>
          <label className="appearance-setting-row">
            <span className="settings-row-icon"><UserRound size={18} aria-hidden="true" /></span>
            <span><strong>{strings.privacy.profileVisibility}</strong></span>
            <select value={family?.defaultProfileVisibility ?? "everyone"} disabled={!family || isSaving} onChange={(event) => void save({ defaultProfileVisibility: event.target.value as "everyone" | "nobody" })}>
              <option value="everyone">{strings.privacy.everyone}</option>
              <option value="nobody">{strings.privacy.nobody}</option>
            </select>
          </label>
          <label className="appearance-setting-row">
            <span className="settings-row-icon"><Clock3 size={18} aria-hidden="true" /></span>
            <span><strong>{strings.privacy.lastSeen}</strong></span>
            <input
              type="checkbox"
              checked={family?.defaultLastSeenVisibility !== "nobody"}
              disabled={!family || isSaving}
              onChange={(event) => void save({ defaultLastSeenVisibility: event.target.checked ? "everyone" : "nobody" })}
            />
          </label>
          <label className="appearance-setting-row">
            <span className="settings-row-icon"><CheckCheck size={18} aria-hidden="true" /></span>
            <span><strong>{strings.privacy.readReceipts}</strong></span>
            <input type="checkbox" checked={family?.defaultReadReceiptsEnabled ?? true} disabled={!family || isSaving} onChange={(event) => void save({ defaultReadReceiptsEnabled: event.target.checked })} />
          </label>
        </section>
        <section className="admin-defaults-notification-settings"><h2>{strings.admin.defaults.notifications}</h2>
          {notificationOptions.map(([key, label, Icon]) => (
            <label className="appearance-setting-row" key={key}>
              <span className="settings-row-icon"><Icon size={18} aria-hidden="true" /></span>
              <span><strong>{label}</strong></span>
              <input type="checkbox" checked={notifications[key]} disabled={!family || isSaving} onChange={(event) => setNotifications({ [key]: event.target.checked })} />
            </label>
          ))}
          <label className="appearance-setting-row">
            <span className="settings-row-icon"><BellOff size={18} aria-hidden="true" /></span>
            <span><strong>{strings.notifications.muteNotifications}</strong></span>
            <input type="checkbox" checked={notifications.quietHoursEnabled} disabled={!family || isSaving} onChange={(event) => setNotifications({ quietHoursEnabled: event.target.checked })} />
          </label>
          <div className={`quiet-hours-times${!notifications.quietHoursEnabled ? " is-disabled" : ""}`}>
            <label>{strings.notifications.start}<input type="time" value={notifications.quietHoursStart} disabled={!family || isSaving || !notifications.quietHoursEnabled} onChange={(event) => setNotifications({ quietHoursStart: event.target.value })} /></label>
            <label>{strings.notifications.end}<input type="time" value={notifications.quietHoursEnd} disabled={!family || isSaving || !notifications.quietHoursEnabled} onChange={(event) => setNotifications({ quietHoursEnd: event.target.value })} /></label>
          </div>
        </section>
		<section className="admin-defaults-call-quality-settings"><h2>Guest meeting quality</h2>
		  <label className="appearance-setting-row">
            <span className="settings-row-icon"><Sliders size={18} aria-hidden="true" /></span>
            <span><strong>Screen-share bitrate (kbps)</strong></span>
            <input type="number" min="1000" max="20000" step="500" inputMode="numeric" value={screenShareBitrateKbps} disabled={!family || isSaving} onChange={(event) => setScreenShareBitrateKbps(event.target.value)} onBlur={() => { const value = Number(screenShareBitrateKbps); if (Number.isInteger(value) && value >= 1000 && value <= 20000 && value !== family?.screenShareBitrateKbps) void save({ screenShareBitrateKbps: value }); else if (family) setScreenShareBitrateKbps(String(family.screenShareBitrateKbps ?? 5000)); }} />
          </label>
		</section>
      </div>}
    </section>
  </main>;
}
