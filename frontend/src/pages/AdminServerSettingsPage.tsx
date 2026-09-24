import { useCallback, useEffect, useState } from "react";
import { Bell, FileArchive, MessageSquare, Sliders, UserRoundX } from "lucide-react";

import { ApiError, getClusterPrefix } from "../api/client";
import type { Family } from "../api/family";
import { getNotificationProviderSettings, updateNotificationProviderSettings, type NotificationProvider } from "../api/admin";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";
import { useStrings } from "../i18n/LanguageContext";

export default function AdminServerSettingsPage() {
  const strings = useStrings();
  const { accessToken, authRequest, currentUser } = useAuth();
  const prefix = getClusterPrefix();
  const isOwner = currentUser?.role === "owner";
  const canManageServer = isOwner || currentUser?.permissions?.includes("manage_server") === true;
  const [family, setFamily] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isProviderLoading, setIsProviderLoading] = useState(true);
  const [isProviderAvailable, setIsProviderAvailable] = useState(false);
  const [screenShareBitrateKbps, setScreenShareBitrateKbps] = useState("5000");
  const [notificationProvider, setNotificationProvider] = useState<NotificationProvider>("firebase");

  const loadFamily = useCallback(async () => {
    if (!accessToken || !isOwner) return;
    try {
      setFamily(await authRequest<Family>("/api/family"));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.admin.serverSettings.loadError);
    }
  }, [accessToken, authRequest, isOwner, strings.admin.serverSettings.loadError]);

  useEffect(() => void loadFamily(), [loadFamily]);
  useEffect(() => {
    if (!accessToken || !canManageServer) return;
    void getNotificationProviderSettings(accessToken).then((settings) => {
      setNotificationProvider(settings.notificationProvider);
      setIsProviderAvailable(true);
    }).catch((err) => {
      setError(err instanceof ApiError ? String(err.message) : strings.admin.serverSettings.loadError);
    }).finally(() => setIsProviderLoading(false));
  }, [accessToken, canManageServer, strings.admin.serverSettings.loadError]);
  useEffect(() => { if (family) setScreenShareBitrateKbps(String(family.screenShareBitrateKbps ?? 5000)); }, [family]);

  async function saveNotificationProvider(provider: NotificationProvider) {
    if (!accessToken) return;
    setIsSaving(true); setError(null); setNotice(null);
    try {
      const updated = await updateNotificationProviderSettings(accessToken, provider);
      setNotificationProvider(updated.notificationProvider); setNotice(strings.admin.serverSettings.saved);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.admin.serverSettings.saveError);
    } finally { setIsSaving(false); }
  }

  async function save(patch: Partial<Family>) {
    setIsSaving(true); setError(null); setNotice(null);
    try {
      const updated = await authRequest<Family>("/api/family", { method: "PATCH", body: patch });
      setFamily(updated); setNotice(strings.admin.serverSettings.saved);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.admin.serverSettings.saveError);
    } finally { setIsSaving(false); }
  }

  const premium = strings.admin.encryption.premium;

  return <main className="app-shell app-frame admin-page admin-detail-page">
    <AppNav />
    <section className="page-surface admin-surface">
      <div className="admin-detail-header"><BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel={strings.admin.backToAdmin} /><h1>{strings.admin.serverSettings.title}</h1></div>
      {!canManageServer && <p className="error-text">{strings.admin.serverSettings.ownerRequired}</p>}
      {error && <p className="error-text">{error}</p>}{notice && <p className="success-text">{notice}</p>}
      {canManageServer && <div className="settings-toggle-groups admin-panel">
        <section><h2>{strings.admin.defaults.notifications}</h2>
          <label className="appearance-setting-row">
            <span className="settings-row-icon"><Bell size={18} aria-hidden="true" /></span>
            <span><strong>{strings.admin.defaults.notificationProvider}</strong></span>
            <select className="admin-defaults-control" aria-label={strings.admin.defaults.notificationProvider} value={notificationProvider} disabled={!accessToken || isSaving || isProviderLoading || !isProviderAvailable} onChange={(event) => void saveNotificationProvider(event.target.value as NotificationProvider)}>
              <option value="firebase">{strings.admin.defaults.firebaseProvider}</option>
              <option value="ntfy">{strings.admin.defaults.ntfyProvider}</option>
            </select>
          </label>
        </section>
        {isOwner && <section className="admin-defaults-call-quality-settings"><h2>{strings.admin.serverSettings.guestMeetingQuality}</h2>
          <label className="appearance-setting-row">
            <span className="settings-row-icon"><Sliders size={18} aria-hidden="true" /></span>
            <span><strong>{strings.admin.serverSettings.screenShareBitrate}</strong></span>
            <input className="admin-defaults-control" type="number" aria-label={strings.admin.serverSettings.screenShareBitrate} min="1000" max="20000" step="500" inputMode="numeric" value={screenShareBitrateKbps} disabled={!family || isSaving} onChange={(event) => setScreenShareBitrateKbps(event.target.value)} onBlur={() => { const value = Number(screenShareBitrateKbps); if (Number.isInteger(value) && value >= 1000 && value <= 20000 && value !== family?.screenShareBitrateKbps) void save({ screenShareBitrateKbps: value }); else if (family) setScreenShareBitrateKbps(String(family.screenShareBitrateKbps ?? 5000)); }} />
          </label>
        </section>}
        <section><h2>{strings.admin.serverSettings.storageAndRetention}</h2>
          <label className="appearance-setting-row appearance-setting-row--disabled">
            <span className="settings-row-icon"><FileArchive size={18} aria-hidden="true" /></span>
            <span><strong>{strings.admin.serverSettings.fileCompression}</strong><small>{strings.admin.serverSettings.fileCompressionHelp}</small></span>
            <select className="admin-defaults-control" aria-label={strings.admin.serverSettings.fileCompression} value="optimize-size" disabled>
              <option value="optimize-size">{strings.admin.serverSettings.optimizeSize}</option>
            </select>
            <span className="premium-feature-badge">{premium}</span>
          </label>
          <label className="appearance-setting-row appearance-setting-row--disabled">
            <span className="settings-row-icon"><MessageSquare size={18} aria-hidden="true" /></span>
            <span><strong>{strings.admin.serverSettings.messageRetention}</strong><small>{strings.admin.serverSettings.messageRetentionHelp}</small></span>
            <select className="admin-defaults-control" aria-label={strings.admin.serverSettings.messageRetention} value="never" disabled>
              <option value="never">{strings.admin.serverSettings.never}</option>
            </select>
            <span className="premium-feature-badge">{premium}</span>
          </label>
          <label className="appearance-setting-row appearance-setting-row--disabled">
            <span className="settings-row-icon"><UserRoundX size={18} aria-hidden="true" /></span>
            <span><strong>{strings.admin.serverSettings.inactiveUserDeletion}</strong><small>{strings.admin.serverSettings.inactiveUserDeletionHelp}</small></span>
            <select className="admin-defaults-control" aria-label={strings.admin.serverSettings.inactiveUserDeletion} value="never" disabled>
              <option value="never">{strings.admin.serverSettings.never}</option>
            </select>
            <span className="premium-feature-badge">{premium}</span>
          </label>
        </section>
      </div>}
    </section>
  </main>;
}
