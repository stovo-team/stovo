import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  AdminMessageEncryptionProtocol,
  DomainLinkResponse,
  EncryptionSettings,
  LogEntry,
  LogLevel,
  LogsResponse,
  MediaQualityRule,
  MediaQualitySettings,
  PublicAccessCandidate,
  PublicAccessCheckResponse,
  PublicAccessSettings,
  PublicAccessSuggestions,
  PublicTunnelStatus,
  PublicInviteLink,
  PublicIPQuickStartResponse,
  QuickStartPublicAccessResponse
} from "../api/admin";
import { ApiError, getApiUrl } from "../api/client";
import { Family } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import AppNav from "./AppNav";

const LOG_LEVELS: Array<LogLevel | ""> = ["","DEBUG","INFO","WARNING","ERROR","CRITICAL"];
type TunnelProvider = "cloudflare" | "localtunnel";
type MediaType = MediaQualityRule["mediaType"];
const MEDIA_TYPES: MediaType[] = ["image","video","audio"];

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function levelClass(level: string) {
  return `log-level log-level-${level.toLowerCase()}`;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function logsPath({ level,loggerName,search,limit }: { level: LogLevel | ""; loggerName: string; search: string; limit: number }) {
  const params = new URLSearchParams();
  if (level) params.set("level",level);
  if (loggerName.trim()) params.set("logger",loggerName.trim());
  if (search.trim()) params.set("search",search.trim());
  params.set("limit",String(limit));
  return `/api/admin/logs?${params.toString()}`;
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded,setExpanded] = useState(false);

  return (
    <article className="log-row">
      <button type="button" className="log-row-main" onClick={() => setExpanded((value) => !value)}>
        <span className={levelClass(entry.level)}>{entry.level}</span>
        <time>{formatTimestamp(entry.timestamp)}</time>
        <strong>{entry.logger}</strong>
        <span>{entry.message}</span>
      </button>
      {expanded && (
        <div className="log-row-details">
          <code>{entry.module}.{entry.functionName}:{entry.lineNo}</code>
          {entry.exception && <pre>{entry.exception}</pre>}
        </div>
      )}
    </article>
  );
}

export default function AdminPage() {
  const { accessToken,authRequest,currentUser } = useAuth();
  const [family,setFamily] = useState<Family | null>(null);
  const [logs,setLogs] = useState<LogsResponse | null>(null);
  const [publicAccess,setPublicAccess] = useState<PublicAccessSettings | null>(null);
  const [mediaQualityRules,setMediaQualityRules] = useState<MediaQualityRule[]>([]);
  const [publicAccessForm,setPublicAccessForm] = useState({ appUrl: "",apiUrl: "" });
  const [publicAccessSuggestions,setPublicAccessSuggestions] = useState<PublicAccessCandidate[]>([]);
  const [publicAccessCheck,setPublicAccessCheck] = useState<PublicAccessCheckResponse | null>(null);
  const [publicTunnel,setPublicTunnel] = useState<PublicTunnelStatus | null>(null);
  const [domainLinkForm,setDomainLinkForm] = useState({ domain: "",apiDomain: "" });
  const [lastDomainLink,setLastDomainLink] = useState<DomainLinkResponse | null>(null);
  const [encryptionSettings,setEncryptionSettings] = useState<EncryptionSettings | null>(null);
  const [encryptionProtocolDraft,setEncryptionProtocolDraft] = useState<AdminMessageEncryptionProtocol>("server_at_rest");
  const [level,setLevel] = useState<LogLevel | "">("");
  const [loggerName,setLoggerName] = useState("");
  const [search,setSearch] = useState("");
  const [limit,setLimit] = useState(200);
  const [autoRefresh,setAutoRefresh] = useState(true);
  const [error,setError] = useState<string | null>(null);
  const [notice,setNotice] = useState<string | null>(null);
  const [isLoading,setIsLoading] = useState(true);
  const [isSavingPublicAccess,setIsSavingPublicAccess] = useState(false);
  const [isSavingMediaQuality,setIsSavingMediaQuality] = useState(false);
  const [isCheckingPublicAccess,setIsCheckingPublicAccess] = useState(false);
  const [startingTunnelProvider,setStartingTunnelProvider] = useState<TunnelProvider | null>(null);
  const [isStoppingTunnel,setIsStoppingTunnel] = useState(false);
  const [isLinkingDomain,setIsLinkingDomain] = useState(false);
  const [isSavingEncryption,setIsSavingEncryption] = useState(false);
  const [isStartingPublicAccess, setIsStartingPublicAccess] = useState(false);
  const [isStartingPublicIPAccess, setIsStartingPublicIPAccess] = useState(false);
  const [inviteLinks, setInviteLinks] = useState<PublicInviteLink[]>([]);
  const [publicIpResult, setPublicIpResult] = useState<PublicIPQuickStartResponse | null>(null);

  const canViewAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";
  const publicAccessReady = Boolean(publicAccess?.configuredAppUrl || publicAccess?.configuredApiUrl || publicTunnel?.url);

  const load = useCallback(async () => {
    if (!accessToken || !canViewAdmin) {
      setIsLoading(false);
      return;
    }

    setError(null);
    try {
      const [familyResult,logsResult,publicAccessResult,mediaQualityResult,suggestionsResult,tunnelResult,encryptionResult] = await Promise.all([
        authRequest<Family>("/api/family"),
        authRequest<LogsResponse>(logsPath({ level,loggerName,search,limit })),
        authRequest<PublicAccessSettings>("/api/admin/public-access"),
        authRequest<MediaQualitySettings>("/api/admin/media-quality"),
        authRequest<PublicAccessSuggestions>("/api/admin/public-access/suggestions"),
        authRequest<PublicTunnelStatus>("/api/admin/public-access/tunnel"),
        authRequest<EncryptionSettings>("/api/admin/encryption-settings")
      ]);
      setFamily(familyResult);
      setLogs(logsResult);
      setPublicAccess(publicAccessResult);
      setMediaQualityRules(mediaQualityResult.rules);
      setPublicAccessSuggestions(suggestionsResult.candidates);
      setPublicTunnel(tunnelResult);
      setEncryptionSettings(encryptionResult);
      setEncryptionProtocolDraft(encryptionResult.defaultMessageEncryptionProtocol);
      setPublicAccessForm({ appUrl: publicAccessResult.appUrl,apiUrl: publicAccessResult.apiUrl });
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load admin data");
    } finally {
      setIsLoading(false);
    }
  },[accessToken,authRequest,canViewAdmin,level,limit,loggerName,search]);

  const loadLogs = useCallback(async () => {
    if (!accessToken || !canViewAdmin) return;
    setError(null);
    try {
      const logsResult = await authRequest<LogsResponse>(logsPath({ level,loggerName,search,limit }));
      setLogs(logsResult);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load logs");
    } finally {
      setIsLoading(false);
    }
  },[accessToken,authRequest,canViewAdmin,level,limit,loggerName,search]);

  useEffect(() => { void load(); },[load]);

  useEffect(() => {
    if (!autoRefresh || !canViewAdmin) return undefined;
    const intervalId = window.setInterval(() => { void loadLogs(); },5000);
    return () => window.clearInterval(intervalId);
  },[autoRefresh,canViewAdmin,loadLogs]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    void loadLogs();
  }

  async function savePublicAccess(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setIsSavingPublicAccess(true);
    try {
      const updated = await authRequest<PublicAccessSettings>("/api/admin/public-access",{
        method: "PUT",
        body: { appUrl: publicAccessForm.appUrl.trim() || null,apiUrl: publicAccessForm.apiUrl.trim() || null }
      });
      setPublicAccess(updated);
      setPublicAccessForm({ appUrl: updated.appUrl,apiUrl: updated.apiUrl });
      setPublicAccessCheck(null);
      setNotice("Public access saved");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not save public access");
    } finally {
      setIsSavingPublicAccess(false);
    }
  }

  async function clearPublicAccess() {
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setIsSavingPublicAccess(true);
    try {
      const updated = await authRequest<PublicAccessSettings>("/api/admin/public-access",{
        method: "PUT",
        body: { appUrl: null,apiUrl: null }
      });
      setPublicAccess(updated);
      setPublicAccessForm({ appUrl: updated.appUrl,apiUrl: updated.apiUrl });
      setPublicAccessCheck(null);
      setInviteLinks([]);
      setNotice("Public access reset");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not reset public access");
    } finally {
      setIsSavingPublicAccess(false);
    }
  }

  async function quickStartPublicAccess() {
    if (!accessToken) {
      return;
    }

    setError(null);
    setNotice(null);
    setPublicIpResult(null);
    setIsStartingPublicAccess(true);

    try {
      const result = await authRequest<QuickStartPublicAccessResponse>(
        "/api/admin/public-access/quick-start",
        { method: "POST" }
      );

      setPublicAccess(result.publicAccess);
      setPublicAccessForm({
        appUrl: result.publicAccess.appUrl,
        apiUrl: result.publicAccess.apiUrl
      });
      setPublicTunnel({
        state: result.status,
        provider: result.provider,
        url: result.publicUrl,
        origin: result.origin,
        message: result.message ?? "Public access is ready",
        logs: [],
        autoRestart: true,
        restarts: 0,
        publicAccess: result.publicAccess
      });
      setInviteLinks(result.inviteLinks);
      setPublicAccessCheck(null);
      setNotice(result.message ?? "Cloudflare Tunnel is ready. Invite links are ready to copy.");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not start Cloudflare Tunnel");
    } finally {
      setIsStartingPublicAccess(false);
    }
  }

  async function quickStartPublicIPAccess() {
    if (!accessToken) {
      return;
    }

    setError(null);
    setNotice(null);
    setPublicIpResult(null);
    setIsStartingPublicIPAccess(true);

    try {
      const result = await authRequest<PublicIPQuickStartResponse>(
        "/api/admin/public-access/public-ip/quick-start",
        { method: "POST" }
      );

      setPublicIpResult(result);

      if (result.status === "ready" && result.publicAccess !== null) {
        const publicAccessResult = result.publicAccess;

        setPublicAccess(publicAccessResult);
        setPublicAccessForm({
          appUrl: publicAccessResult.appUrl,
          apiUrl: publicAccessResult.apiUrl
        });
        setInviteLinks(result.inviteLinks);
        setPublicAccessCheck(null);
        setNotice("Public IP access is ready. Invite links are ready to copy.");
        return;
      }

      setInviteLinks([]);
      setNotice("Public IP is not reachable. Use Cloudflare Tunnel or fix router/firewall settings.");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not check Public IP access");
    } finally {
      setIsStartingPublicIPAccess(false);
    }
  }
  function updateMediaQualityRule(index: number,patch: Partial<MediaQualityRule>) {
    setMediaQualityRules((current) => current.map((rule,ruleIndex) => ruleIndex === index ? { ...rule,...patch } : rule));
  }

  function addMediaQualityRule() {
    setMediaQualityRules((current) => [...current,{ mediaType: "image",extension: ".jpg",qualityPercent: 85 }]);
  }

  function removeMediaQualityRule(index: number) {
    setMediaQualityRules((current) => current.filter((_,ruleIndex) => ruleIndex !== index));
  }

  async function saveMediaQuality(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setIsSavingMediaQuality(true);
    try {
      const updated = await authRequest<MediaQualitySettings>("/api/admin/media-quality",{
        method: "PUT",
        body: { rules: mediaQualityRules.map((rule) => ({ mediaType: rule.mediaType,extension: rule.extension.trim(),qualityPercent: Number(rule.qualityPercent) })) }
      });
      setMediaQualityRules(updated.rules);
      setNotice("Media quality saved");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not save media quality");
    } finally {
      setIsSavingMediaQuality(false);
    }
  }

  async function saveEncryptionSettings(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setIsSavingEncryption(true);
    try {
      const updated = await authRequest<EncryptionSettings>("/api/admin/encryption-settings",{
        method: "PUT",
        body: { defaultMessageEncryptionProtocol: encryptionProtocolDraft }
      });
      setEncryptionSettings(updated);
      setEncryptionProtocolDraft(updated.defaultMessageEncryptionProtocol);
      setNotice("Encryption settings saved");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not save encryption settings");
    } finally {
      setIsSavingEncryption(false);
    }
  }

  function useBrowserUrls() {
    setPublicAccessForm({ appUrl: window.location.origin,apiUrl: getApiUrl() });
    setPublicAccessCheck(null);
    setNotice(null);
  }

  function useCurrentNetworkUrls() {
    if (isLoopbackHost(window.location.hostname)) {
      setNotice("Open the admin page with the LAN address, then press this again");
      return;
    }
    const publicUrl = `${window.location.protocol}//${window.location.hostname}:8000`;
    setPublicAccessForm({ appUrl: publicUrl,apiUrl: publicUrl });
    setPublicAccessCheck(null);
    setNotice(null);
  }

  function useCandidate(candidate: PublicAccessCandidate) {
    setPublicAccessForm({ appUrl: candidate.appUrl,apiUrl: candidate.apiUrl });
    setPublicAccessCheck(null);
    setNotice(null);
  }

  async function checkSavedPublicAccess() {
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setIsCheckingPublicAccess(true);
    try {
      const result = await authRequest<PublicAccessCheckResponse>("/api/admin/public-access/check");
      setPublicAccessCheck(result);
      setNotice(result.allOk ? "Saved URLs are reachable" : "One or more saved URLs failed");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not check public access");
    } finally {
      setIsCheckingPublicAccess(false);
    }
  }

  function applyTunnelResult(result: PublicTunnelStatus) {
    setPublicTunnel(result);
    if (result.publicAccess) {
      setPublicAccess(result.publicAccess);
      setPublicAccessForm({ appUrl: result.publicAccess.appUrl,apiUrl: result.publicAccess.apiUrl });
      setPublicAccessCheck(null);
    }
  }

  async function startTunnel(provider: TunnelProvider) {
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setStartingTunnelProvider(provider);
    try {
      const result = await authRequest<PublicTunnelStatus>(`/api/admin/public-access/tunnel/start?provider=${provider}`,{ method: "POST" });
      applyTunnelResult(result);
      setNotice(result.url ? "Public tunnel started" : result.message ?? "Could not start public tunnel");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not start public tunnel");
    } finally {
      setStartingTunnelProvider(null);
    }
  }

  async function linkDomainToPublicIp() {
    if (!accessToken || !domainLinkForm.domain.trim()) {
      setNotice("Enter a domain first");
      return;
    }
    setError(null);
    setNotice(null);
    setIsLinkingDomain(true);
    try {
      const result = await authRequest<DomainLinkResponse>("/api/admin/public-access/domain-link",{
        method: "POST",
        body: { domain: domainLinkForm.domain.trim(),apiDomain: domainLinkForm.apiDomain.trim() || null }
      });
      setLastDomainLink(result);
      if (result.publicAccess) {
        setPublicAccess(result.publicAccess);
        setPublicAccessForm({ appUrl: result.publicAccess.appUrl,apiUrl: result.publicAccess.apiUrl });
      }
      setNotice("Domain URLs linked. Add DNS records shown below.");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not link domain");
    } finally {
      setIsLinkingDomain(false);
    }
  }

  async function stopTunnel() {
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setIsStoppingTunnel(true);
    try {
      const result = await authRequest<PublicTunnelStatus>("/api/admin/public-access/tunnel/stop",{ method: "POST" });
      applyTunnelResult(result);
      setNotice("Public tunnel stopped");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not stop public tunnel");
    } finally {
      setIsStoppingTunnel(false);
    }
  }

  return (
    <main className="app-shell app-frame">
      <AppNav />
      <section className="page-surface">
        <div className="masthead">
          <div>
            <p className="eyebrow">{family?.name ?? "Velo"}</p>
            <h1>Admin</h1>
          </div>
        </div>

        {!canViewAdmin && <p className="error-text">Admin access required.</p>}
        {error && <p className="error-text">{error}</p>}
        {notice && <p className="success-text">{notice}</p>}

        {canViewAdmin && (
          <>
            <section className="public-access-panel">
              <div className="public-access-header">
                <h2>Public access</h2>
                <strong>{publicAccessReady ? "Ready" : "Private"}</strong>
              </div>

              <div className="tunnel-panel">
                <div>
                  <span className="summary-label">Recommended</span>
                  <strong>Cloudflare Tunnel</strong>
                  <span>Best one-click option. Works even when router, firewall, or ISP blocks direct Public IP access.</span>
                </div>
                <div className="public-access-actions">
                  <button
                    type="button"
                    disabled={isStartingPublicAccess}
                    onClick={() => void quickStartPublicAccess()}
                  >
                    {isStartingPublicAccess ? "Starting..." : "Start Cloudflare Tunnel"}
                  </button>
                </div>
              </div>

              <div className="tunnel-panel">
                <div>
                  <span className="summary-label">Advanced</span>
                  <strong>Public IP</strong>
                  <span>Works only if TCP port 8000 is reachable from the internet.</span>
                </div>
                <div className="public-access-actions">
                  <button
                    type="button"
                    disabled={isStartingPublicIPAccess}
                    onClick={() => void quickStartPublicIPAccess()}
                  >
                    {isStartingPublicIPAccess ? "Checking..." : "Try Public IP"}
                  </button>
                </div>
              </div>

              {publicIpResult?.status === "blocked" && (
                <div className="network-checks">
                  <article className="network-check error">
                    <strong>Public IP is not reachable</strong>
                    {publicIpResult.publicUrl && <code>{publicIpResult.publicUrl}</code>}
                    <span>Your router, firewall, or ISP blocks incoming access to TCP port 8000.</span>
                  </article>
                  {publicIpResult.problems.map((problem: string) => (
                    <article className="network-check error" key={problem}>
                      <strong>Problem</strong>
                      <span>{problem}</span>
                    </article>
                  ))}
                  {publicIpResult.recommendedActions.map((action: string) => (
                    <article className="network-check ok" key={action}>
                      <strong>Recommended action</strong>
                      <span>{action}</span>
                    </article>
                  ))}
                  <div className="public-access-actions">
                    <a
                      className="public-access-link-button"
                      href="/scripts/windows-public-ip-fix.ps1"
                      download
                    >
                      Download Windows fix script
                    </a>
                  </div>
                  <article className="network-check ok">
                    <strong>Run as Administrator</strong>
                    <span>Open PowerShell as Administrator, then run:</span>
                    <code>cd $env:USERPROFILE\Downloads; powershell -ExecutionPolicy Bypass -File .\windows-public-ip-fix.ps1</code>
                  </article>
                  <div className="public-access-actions">
                    <button type="button" onClick={() => void quickStartPublicAccess()}>
                      Start Cloudflare Tunnel instead
                    </button>
                  </div>
                </div>
              )}

              {publicAccessReady && (
                <div className="public-access-current">
                  <div>
                    <span className="summary-label">Public link</span>
                    <code>{publicAccess?.appUrl ?? publicTunnel?.url ?? "Loading"}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(publicAccess?.appUrl ?? publicTunnel?.url ?? "")}
                  >
                    Copy public link
                  </button>
                </div>
              )}

              {inviteLinks.length > 0 && (
                <div className="invite-links">
                  <h3>Invite links</h3>
                  {inviteLinks.map((invite) => (
                    <article key={invite.id} className="invite-link-card">
                      <div>
                        <strong>{invite.role}</strong>
                        <code>{invite.url}</code>
                      </div>
                      <button type="button" onClick={() => void navigator.clipboard.writeText(invite.url)}>
                        Copy
                      </button>
                    </article>
                  ))}
                </div>
              )}

              <details className="advanced-public-access">
                <summary>Advanced manual settings</summary>

                <div className="public-access-current">
                  <div>
                    <span className="summary-label">App URL</span>
                    <code>{publicAccess?.appUrl ?? "Loading"}</code>
                  </div>
                  <div>
                    <span className="summary-label">API URL</span>
                    <code>{publicAccess?.apiUrl ?? "Loading"}</code>
                  </div>
                </div>

                <div className="tunnel-panel">
                  <div>
                    <span className="summary-label">Public tunnel</span>
                    <strong>
                      {publicTunnel?.provider ? `${publicTunnel.provider} / ` : ""}
                      {publicTunnel?.state ?? "stopped"}
                    </strong>
                    {publicTunnel?.url && <code>{publicTunnel.url}</code>}
                    {publicTunnel?.message && <span>{publicTunnel.message}</span>}
                    <span>Auto-restart: {publicTunnel?.autoRestart ? "on" : "off"}</span>
                    <span>Restarts: {publicTunnel?.restarts ?? 0}</span>
                  </div>
                  <div className="public-access-actions">
                    <button
                      type="button"
                      disabled={startingTunnelProvider !== null || publicTunnel?.state === "running"}
                      onClick={() => void startTunnel("cloudflare")}
                    >
                      {startingTunnelProvider === "cloudflare" ? "Starting" : "Start Cloudflare"}
                    </button>
                    <button
                      type="button"
                      disabled={startingTunnelProvider !== null || publicTunnel?.state === "running"}
                      onClick={() => void startTunnel("localtunnel")}
                    >
                      {startingTunnelProvider === "localtunnel" ? "Starting" : "Start LocalTunnel"}
                    </button>
                    <button
                      type="button"
                      disabled={isStoppingTunnel || publicTunnel?.state !== "running"}
                      onClick={() => void stopTunnel()}
                    >
                      {isStoppingTunnel ? "Stopping" : "Stop tunnel"}
                    </button>
                  </div>
                </div>

                <div className="tunnel-panel">
                  <div>
                    <span className="summary-label">Domain to Public IP</span>
                    <strong>Manual DNS setup</strong>
                    {lastDomainLink?.publicIp && <code>Detected public IP: {lastDomainLink.publicIp}</code>}
                  </div>
                  <div className="public-access-actions">
                    <input
                      placeholder="yourdomain.com"
                      value={domainLinkForm.domain}
                      onChange={(event) => setDomainLinkForm({ ...domainLinkForm, domain: event.target.value })}
                    />
                    <input
                      placeholder="api.yourdomain.com (optional)"
                      value={domainLinkForm.apiDomain}
                      onChange={(event) => setDomainLinkForm({ ...domainLinkForm, apiDomain: event.target.value })}
                    />
                    <button type="button" disabled={isLinkingDomain} onClick={() => void linkDomainToPublicIp()}>
                      {isLinkingDomain ? "Linking" : "Link Domain"}
                    </button>
                  </div>
                  {lastDomainLink?.records?.length ? (
                    <div className="network-checks">
                      {lastDomainLink.records.map((record) => (
                        <article className="network-check ok" key={`${record.type}-${record.name}-${record.value}`}>
                          <strong>{record.type}</strong>
                          <code>{record.name}</code>
                          <span>{record.value}</span>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>

                <form className="public-access-form" onSubmit={savePublicAccess}>
                  <label>
                    App URL
                    <input
                      placeholder="https://messenger.example.com"
                      value={publicAccessForm.appUrl}
                      onChange={(event) =>
                        setPublicAccessForm({ ...publicAccessForm, appUrl: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    API URL
                    <input
                      placeholder="https://api.example.com"
                      value={publicAccessForm.apiUrl}
                      onChange={(event) =>
                        setPublicAccessForm({ ...publicAccessForm, apiUrl: event.target.value })
                      }
                    />
                  </label>
                  <div className="public-access-actions">
                    <button type="button" onClick={useCurrentNetworkUrls}>
                      Use LAN host
                    </button>
                    <button type="button" onClick={useBrowserUrls}>
                      Use browser URLs
                    </button>
                    <button type="submit" disabled={isSavingPublicAccess}>
                      {isSavingPublicAccess ? "Saving" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={isCheckingPublicAccess}
                      onClick={() => void checkSavedPublicAccess()}
                    >
                      {isCheckingPublicAccess ? "Checking" : "Check saved URLs"}
                    </button>
                    <button
                      type="button"
                      disabled={isSavingPublicAccess}
                      onClick={() => void clearPublicAccess()}
                    >
                      Clear
                    </button>
                  </div>
                </form>

                {publicAccessSuggestions.length > 0 && (
                  <div className="candidate-list">
                    {publicAccessSuggestions.map((candidate) => (
                      <button
                        type="button"
                        key={`${candidate.appUrl}-${candidate.apiUrl}`}
                        onClick={() => useCandidate(candidate)}
                      >
                        {candidate.label}
                      </button>
                    ))}
                  </div>
                )}

                {publicAccessCheck && (
                  <div className="network-checks">
                    {publicAccessCheck.targets.map((target) => (
                      <article className={target.ok ? "network-check ok" : "network-check error"} key={target.name}>
                        <strong>{target.name}</strong>
                        <code>{target.url}</code>
                        <span>{target.statusCode ? `${target.statusCode} ${target.detail}` : target.detail}</span>
                      </article>
                    ))}
                  </div>
                )}
              </details>
            </section>

            <section className="encryption-settings-panel">
              <div className="public-access-header">
                <h2>Message encryption</h2>
                <strong>{encryptionSettings?.supportedProtocols.find((protocol) => protocol.value === encryptionProtocolDraft)?.label ?? "Server-side"}</strong>
              </div>
              <form className="encryption-settings-form" onSubmit={saveEncryptionSettings}>
                <label>
                  Default for new chats
                  <select value={encryptionProtocolDraft} onChange={(event) => setEncryptionProtocolDraft(event.target.value as AdminMessageEncryptionProtocol)}>
                    {(encryptionSettings?.supportedProtocols ?? []).map((protocol) => <option key={protocol.value} value={protocol.value}>{protocol.label}</option>)}
                  </select>
                </label>
                <div className="encryption-protocol-list">
                  {(encryptionSettings?.supportedProtocols ?? []).map((protocol) => (
                    <article className={protocol.value === encryptionProtocolDraft ? "active" : ""} key={protocol.value}>
                      <strong>{protocol.label}</strong>
                      <span>{protocol.description}</span>
                    </article>
                  ))}
                </div>
                <button type="submit" disabled={isSavingEncryption}>{isSavingEncryption ? "Saving" : "Save encryption"}</button>
              </form>
            </section>

            <section className="media-quality-panel">
              <div className="public-access-header">
                <h2>Stored media quality</h2>
                <strong>{mediaQualityRules.length} rules</strong>
              </div>
              <form className="media-quality-form" onSubmit={saveMediaQuality}>
                <div className="media-quality-grid">
                  {mediaQualityRules.map((rule,index) => {
                    const isDefaultRule = rule.extension === "";
                    return (
                      <article className="media-quality-row" key={`${rule.mediaType}-${rule.extension}-${index}`}>
                        <label>
                          Type
                          <select value={rule.mediaType} disabled={isDefaultRule} onChange={(event) => updateMediaQualityRule(index,{ mediaType: event.target.value as MediaType })}>
                            {MEDIA_TYPES.map((mediaType) => <option value={mediaType} key={mediaType}>{mediaType}</option>)}
                          </select>
                        </label>
                        <label>
                          Extension
                          <input placeholder={isDefaultRule ? "Default" : ".jpg"} value={rule.extension} disabled={isDefaultRule} onChange={(event) => updateMediaQualityRule(index,{ extension: event.target.value })} />
                        </label>
                        <label>
                          Quality
                          <span className="quality-control">
                            <input min={1} max={100} type="range" value={rule.qualityPercent} onChange={(event) => updateMediaQualityRule(index,{ qualityPercent: Number(event.target.value) })} />
                            <input min={1} max={100} type="number" value={rule.qualityPercent} onChange={(event) => updateMediaQualityRule(index,{ qualityPercent: Number(event.target.value) })} />
                            <span>%</span>
                          </span>
                        </label>
                        <button type="button" disabled={isDefaultRule} onClick={() => removeMediaQualityRule(index)}>Remove</button>
                      </article>
                    );
                  })}
                </div>
                <div className="public-access-actions">
                  <button type="button" onClick={addMediaQualityRule}>Add extension</button>
                  <button type="submit" disabled={isSavingMediaQuality}>{isSavingMediaQuality ? "Saving" : "Save quality"}</button>
                </div>
              </form>
            </section>

            <div className="summary-band compact">
              <div><span className="summary-label">Visible</span><strong>{logs?.records.length ?? 0}</strong></div>
              <div><span className="summary-label">Matched</span><strong>{logs?.total ?? 0}</strong></div>
              <div><span className="summary-label">Buffer</span><strong>{logs?.bufferSize ?? 0}</strong></div>
            </div>

            <form className="log-toolbar" onSubmit={handleSubmit}>
              <label>
                Level
                <select value={level} onChange={(event) => setLevel(event.target.value as LogLevel | "")}>{LOG_LEVELS.map((item) => <option key={item || "ALL"} value={item}>{item || "ALL"}</option>)}</select>
              </label>
              <label>
                Logger
                <input placeholder="app.modules.realtime" value={loggerName} onChange={(event) => setLoggerName(event.target.value)} />
              </label>
              <label>
                Search
                <input value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <label>
                Limit
                <input min={1} max={1000} type="number" value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
              </label>
              <label className="inline-toggle">
                <input checked={autoRefresh} type="checkbox" onChange={(event) => setAutoRefresh(event.target.checked)} />
                Auto
              </label>
              <button type="submit" disabled={isLoading}>Refresh</button>
            </form>

            <section className="log-panel" aria-busy={isLoading}>
              {logs?.records.length ? logs.records.slice().reverse().map((entry) => <LogRow entry={entry} key={entry.id} />) : (
                <div className="phase-empty-state">
                  <strong>{isLoading ? "Loading logs" : "No logs found"}</strong>
                  <p>Adjust filters or wait for new backend activity.</p>
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
