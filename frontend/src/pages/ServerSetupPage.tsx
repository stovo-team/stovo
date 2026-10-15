import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { setApiUrlOverride } from "../api/client";
import StovoLogo from "../components/StovoLogo";
import { useStrings } from "../i18n/LanguageContext";

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export default function ServerSetupPage() {
  const strings = useStrings();
  const copy = strings.serverSetup;
  const navigate = useNavigate();
  const location = useLocation();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const server = normalizeUrl(params.get("server") ?? "");
    if (server) setUrl(server);
  }, [location.search]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError(copy.invalidUrl);
      return;
    }
    setError(null);
    setIsTesting(true);
    try {
      const res = await fetch(`${normalized}/api/auth/setup-status`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok && res.status !== 401) {
        setError(copy.serverReply(res.status));
        return;
      }
      const data = await res.json().catch(() => null);
      const familyName = typeof data?.familyName === "string" ? data.familyName : undefined;
      setApiUrlOverride(normalized, familyName);
      const loginParams = new URLSearchParams();
      const supplied = new URLSearchParams(location.search);
      const username = supplied.get("username");
      const deviceLogin = supplied.get("deviceLogin");
      if (username) loginParams.set("username", username);
      if (deviceLogin === "1") loginParams.set("deviceLogin", "1");
      navigate(`/login${loginParams.size ? `?${loginParams}` : ""}`, { replace: true });
    } catch (err) {
      setError(copy.cannotReach(normalized, String(err)));
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <p className="eyebrow">{strings.brand.setup}</p>
        <StovoLogo className="app-brand-logo" title="Stovo" />
        <h1>{copy.title}</h1>
        <p className="muted-copy">
          {copy.hint} <strong>{copy.hintHttps}</strong> {copy.hintSuffix}
        </p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            {copy.serverUrl}
            <input
              required
              type="url"
              placeholder={copy.placeholder}
              autoComplete="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setError(null);
              }}
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={isTesting}>
            {isTesting ? copy.testingConnection : copy.connect}
          </button>
        </form>
        <p className="secondary-link">
          {copy.localNetworkHint} <code>{copy.localNetworkExample}</code>
        </p>
      </section>
    </main>
  );
}
