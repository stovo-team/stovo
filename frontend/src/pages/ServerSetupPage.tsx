import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { setApiUrlOverride } from "../api/client";
import VeloLogo from "../components/VeloLogo";

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
      setError("Enter a valid URL, e.g. https://stovo.example.com or http://192.168.1.100:8000");
      return;
    }
    setError(null);
    setIsTesting(true);
    try {
      const res = await fetch(`${normalized}/api/auth/setup-status`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok && res.status !== 401) {
        setError(`Server replied with ${res.status} — check the URL`);
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
      setError(`Cannot reach ${normalized} — ${String(err)}`);
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <p className="eyebrow">Setup</p>
        <VeloLogo className="app-brand-logo" title="Stovo" />
        <h1>Server address</h1>
        <p className="muted-copy">
          Enter the address of your Stovo server. Use <strong>https://</strong> for domain names.
        </p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Server URL
            <input
              required
              type="url"
              placeholder="https://stovo.example.com"
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
            {isTesting ? "Testing connection…" : "Connect"}
          </button>
        </form>
        <p className="secondary-link">
          For local network: <code>http://192.168.1.100:8000</code>
        </p>
      </section>
    </main>
  );
}
