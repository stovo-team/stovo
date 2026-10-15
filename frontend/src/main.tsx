import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./design-system/tokens.css";
import "./styles.css";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`)
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const assets = performance.getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => {
            try {
              const parsed = new URL(url);
              return parsed.origin === window.location.origin && /\/(assets)\//.test(parsed.pathname);
            } catch {
              return false;
            }
          });
        registration.active?.postMessage({ type: "stovo:cache-assets", assets });
      })
      .catch(() => undefined);
  });
}

async function startApp() {
  if (import.meta.env.DEV && import.meta.env.MODE === "mock") {
    const [{ installMockApi }, { clearRecentChatHistory }, { isMockMode, prepareMockSession }] = await Promise.all([
      import("./dev/mockApi"),
      import("./chatHistoryCache"),
      import("./dev/mockBootstrap"),
    ]);
    if (isMockMode(import.meta.env.DEV, import.meta.env.MODE)) {
      await clearRecentChatHistory();
      await prepareMockSession(window.location.origin);
      installMockApi({ origin: window.location.origin });
    }
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}

void startApp();
