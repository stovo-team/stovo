import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { setApiUrlOverride } from "../api/client";
import VeloLogo from "../components/VeloLogo";

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function ServerSetupPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!isValidHttpUrl(trimmed)) {
      setError("Enter a valid URL, e.g. http://192.168.1.100:8000");
      return;
    }
    setApiUrlOverride(trimmed);
    navigate("/", { replace: true });
  }

  return (
    <main className="app-shell">
      <section className="auth-panel">
        <p className="eyebrow">Setup</p>
        <VeloLogo className="app-brand-logo" title="Stovo" />
        <h1>Server address</h1>
        <p className="muted-copy">
          Enter the address of your Stovo server to connect.
        </p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Server URL
            <input
              required
              type="url"
              placeholder="http://192.168.1.100:8000"
              autoComplete="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setError(null);
              }}
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit">Connect</button>
        </form>
        <p className="secondary-link">
          Find the server IP in your router or run <code>ipconfig</code> on the
          server machine.
        </p>
      </section>
    </main>
  );
}
