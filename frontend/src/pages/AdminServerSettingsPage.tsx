import { useCallback, useEffect, useState } from "react";
import { Bell, FileArchive, House, MessageSquare, Sliders, UserRoundX } from "lucide-react";

import { ApiError, getClusterPrefix } from "../api/client";
import type { Family } from "../api/family";
import { getNotificationProviderSettings, updateNotificationProviderSettings, type NotificationProvider } from "../api/admin";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";
import "./AdminServerSettingsPage.css";
import { GuestMeetingSelect } from "../features/chats/calling/GuestMeetingSelect";
import { useStrings } from "../i18n/LanguageContext";

export default function AdminServerSettingsPage() {
  const strings = useStrings();
  const { accessToken, authRequest, currentUser } = useAuth();
  const prefix = getClusterPrefix();
  const isOwner = currentUser?.role === "owner";
  const canManageSpaceName = isOwner || currentUser?.role === "admin";
  const canManageServer = isOwner || currentUser?.permissions?.includes("manage_server") === true;
  const [family, setFamily] = useState<Family | null>(null);
  const [spaceNameDraft, setSpaceNameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isProviderLoading, setIsProviderLoading] = useState(true);
  const [isProviderAvailable, setIsProviderAvailable] = useState(false);
  type QualityField = "screenShareBitrateKbps" | "cameraBitrateKbps" | "groupCallScreenShareBitrateKbps" | "groupCallCameraBitrateKbps" | "dmCallScreenShareBitrateKbps" | "dmCallCameraBitrateKbps";
  const qualityDefaults: Record<QualityField, number> = {
    screenShareBitrateKbps: 5000,
    cameraBitrateKbps: 1500,
    groupCallScreenShareBitrateKbps: 5000,
    groupCallCameraBitrateKbps: 1500,
    dmCallScreenShareBitrateKbps: 5000,
    dmCallCameraBitrateKbps: 1500,
  };
  const [qualityDrafts, setQualityDrafts] = useState<Record<QualityField, string>>(
    Object.fromEntries(Object.entries(qualityDefaults).map(([key, value]) => [key, String(value)])) as Record<QualityField, string>,
  );
  const [notificationProvider, setNotificationProvider] = useState<NotificationProvider>("firebase");

  const loadFamily = useCallback(async () => {
    if (!accessToken || !canManageServer) return;
    try {
      setFamily(await authRequest<Family>("/api/family"));
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : strings.admin.serverSettings.loadError);
    }
  }, [accessToken, authRequest, canManageServer, strings.admin.serverSettings.loadError]);

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
  useEffect(() => {
    if (!family) return;
    setSpaceNameDraft(family.name);
    setQualityDrafts(Object.fromEntries(
      Object.entries(qualityDefaults).map(([key, fallback]) => [key, String(family[key as QualityField] ?? fallback)]),
    ) as Record<QualityField, string>);
  }, [family]);

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

  function updateBitrateDraft(field: QualityField, value: string) {
    setQualityDrafts((current) => ({ ...current, [field]: value }));
  }

  function saveBitrate(field: QualityField) {
    if (!family) return;
    const value = Number(qualityDrafts[field]);
    const currentValue = family[field] ?? qualityDefaults[field];
    if (Number.isInteger(value) && value >= 1000 && value <= 20000 && value !== currentValue) {
      void save({ [field]: value });
    } else {
      updateBitrateDraft(field, String(currentValue));
    }
  }

  function saveSpaceName() {
    if (!family) return;
    const name = spaceNameDraft.trim();
    if (name && name !== family.name) {
      void save({ name });
    } else {
      setSpaceNameDraft(family.name);
    }
  }

  function qualityControl(field: QualityField, label: string) {
    return <label className="appearance-setting-row" key={field}>
      <span className="settings-row-icon"><Sliders size={18} aria-hidden="true" /></span>
      <span><strong>{label}</strong></span>
      <input className="admin-defaults-control" type="number" aria-label={label} min="1000" max="20000" step="500" inputMode="numeric" value={qualityDrafts[field]} disabled={!family || isSaving} onChange={(event) => updateBitrateDraft(field, event.target.value)} onBlur={() => saveBitrate(field)} />
    </label>;
  }

  const premium = strings.admin.encryption.premium;

  return <main className="app-shell app-frame admin-page admin-detail-page">
    <AppNav />
    <section className="page-surface admin-surface">
      <div className="admin-detail-header"><BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel={strings.admin.backToAdmin} /><h1>{strings.admin.serverSettings.title}</h1></div>
      {!canManageServer && <p className="error-text">{strings.admin.serverSettings.ownerRequired}</p>}
      {error && <p className="error-text">{error}</p>}{notice && <p className="success-text">{notice}</p>}
      {canManageServer && <div className="settings-toggle-groups admin-panel">
        {canManageSpaceName && <section>
          <label className="appearance-setting-row">
            <span className="settings-row-icon"><House size={18} aria-hidden="true" /></span>
            <span><strong>{strings.admin.serverSettings.spaceName}</strong></span>
            <input className="admin-defaults-control" type="text" aria-label={strings.admin.serverSettings.spaceName} maxLength={255} value={spaceNameDraft} disabled={!family || isSaving} onChange={(event) => setSpaceNameDraft(event.target.value)} onBlur={saveSpaceName} />
          </label>
        </section>}
        <section><h2>{strings.admin.defaults.notifications}</h2>
          <label className="appearance-setting-row">
            <span className="settings-row-icon"><Bell size={18} aria-hidden="true" /></span>
            <span><strong>{strings.admin.defaults.notificationProvider}</strong></span>
            <GuestMeetingSelect
              ariaLabel={strings.admin.defaults.notificationProvider}
              className="server-settings-select"
              disabled={!accessToken || isSaving || isProviderLoading || !isProviderAvailable}
              value={notificationProvider}
              options={[
                { value: "firebase", label: strings.admin.defaults.firebaseProvider },
                { value: "ntfy", label: strings.admin.defaults.ntfyProvider }
              ]}
              onChange={(provider) => void saveNotificationProvider(provider as NotificationProvider)}
            />
          </label>
        </section>
        <section className="admin-defaults-call-quality-settings"><h2>{strings.admin.serverSettings.aiFunctions}</h2>
          {([
            ["translationEnabled", strings.admin.serverSettings.translation],
            ["callRecordingEnabled", strings.admin.serverSettings.callRecording],
            ["aiNotesEnabled", strings.admin.serverSettings.aiNotes],
            ["voiceTranscriptionEnabled", strings.admin.serverSettings.voiceTranscription],
          ] as const).map(([field, label]) => <label className="appearance-setting-row" key={field}>
            <span><strong>{label}</strong></span>
            <input type="checkbox" aria-label={label} checked={family?.[field] ?? true} disabled={!family || isSaving || !canManageServer} onChange={(event) => void save({ [field]: event.target.checked })} />
          </label>)}
        </section>
        {isOwner && <>
          <section className="admin-defaults-call-quality-settings"><h2>{strings.admin.serverSettings.guestMeetingQuality}</h2>
            {qualityControl("cameraBitrateKbps", strings.admin.serverSettings.cameraBitrate)}
          </section>
          <section className="admin-defaults-call-quality-settings"><h2>{strings.admin.serverSettings.groupCallsQuality}</h2>
            {qualityControl("groupCallCameraBitrateKbps", strings.admin.serverSettings.cameraBitrate)}
          </section>
          <section className="admin-defaults-call-quality-settings"><h2>{strings.admin.serverSettings.voiceChannelTimeoutHeading}</h2>
            <div className="appearance-setting-row appearance-setting-row--disabled">
              <span className="settings-row-icon"><Sliders size={18} aria-hidden="true" /></span>
              <span><strong>{strings.admin.serverSettings.voiceChannelTimeoutLabel}</strong><small>{strings.admin.serverSettings.voiceChannelTimeoutHelp}</small></span>
              <GuestMeetingSelect ariaLabel={strings.admin.serverSettings.voiceChannelTimeoutLabel} className="server-settings-select" value="never" options={[{ value: "never", label: strings.admin.serverSettings.never }]} disabled onChange={() => undefined} />
              <span className="premium-feature-badge">{premium}</span>
            </div>
          </section>
          <section className="admin-defaults-call-quality-settings"><h2>{strings.admin.serverSettings.dmCallsQuality}</h2>
            {qualityControl("dmCallCameraBitrateKbps", strings.admin.serverSettings.cameraBitrate)}
          </section>
        </>}
        {canManageServer && <section className="admin-defaults-call-quality-settings"><h2>{strings.admin.serverSettings.safetyAndModeration}</h2>
          {[["shield", strings.admin.serverSettings.disallowedFileTypes], ["verified_user", strings.admin.serverSettings.contentSafetyChecks], ["filter_alt", strings.admin.serverSettings.antispam]].map(([icon, label]) =>
            <div className="appearance-setting-row appearance-setting-row--disabled" key={label}>
              <span className="settings-row-icon"><span className="ms-icon ms-icon--20" aria-hidden="true">{icon}</span></span>
              <span><strong>{label}</strong></span>
              <button className="server-settings-placeholder" type="button" disabled aria-label={label}>{strings.admin.serverSettings.notConfigured}</button>
              <span className="premium-feature-badge">{premium}</span>
            </div>
          )}
        </section>}
        <section><h2>{strings.admin.serverSettings.storageAndRetention}</h2>
          <label className="appearance-setting-row appearance-setting-row--disabled">
            <span className="settings-row-icon"><FileArchive size={18} aria-hidden="true" /></span>
            <span><strong>{strings.admin.serverSettings.fileCompression}</strong><small>{strings.admin.serverSettings.fileCompressionHelp}</small></span>
            <GuestMeetingSelect ariaLabel={strings.admin.serverSettings.fileCompression} className="server-settings-select" value="optimize-size" options={[{ value: "optimize-size", label: strings.admin.serverSettings.optimizeSize }]} disabled onChange={() => undefined} />
            <span className="premium-feature-badge">{premium}</span>
          </label>
          <label className="appearance-setting-row appearance-setting-row--disabled">
            <span className="settings-row-icon"><MessageSquare size={18} aria-hidden="true" /></span>
            <span><strong>{strings.admin.serverSettings.messageRetention}</strong><small>{strings.admin.serverSettings.messageRetentionHelp}</small></span>
            <GuestMeetingSelect ariaLabel={strings.admin.serverSettings.messageRetention} className="server-settings-select" value="never" options={[{ value: "never", label: strings.admin.serverSettings.never }]} disabled onChange={() => undefined} />
            <span className="premium-feature-badge">{premium}</span>
          </label>
          <label className="appearance-setting-row appearance-setting-row--disabled">
            <span className="settings-row-icon"><UserRoundX size={18} aria-hidden="true" /></span>
            <span><strong>{strings.admin.serverSettings.inactiveUserDeletion}</strong><small>{strings.admin.serverSettings.inactiveUserDeletionHelp}</small></span>
            <GuestMeetingSelect ariaLabel={strings.admin.serverSettings.inactiveUserDeletion} className="server-settings-select" value="never" options={[{ value: "never", label: strings.admin.serverSettings.never }]} disabled onChange={() => undefined} />
            <span className="premium-feature-badge">{premium}</span>
          </label>
        </section>
      </div>}
    </section>
  </main>;
}
