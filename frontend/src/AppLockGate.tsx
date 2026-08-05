import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { LockKeyhole } from "lucide-react";

import {
  authenticateAppLock,
  isAndroidAppLockAvailablePlatform
} from "./native/appLockPlugin";
import { readDevicePreferences } from "./settings/devicePreferences";

/**
 * Full-screen gate that locks the Android app behind device PIN / biometrics
 * whenever App Lock is enabled in device preferences.
 */
export default function AppLockGate() {
  const [isLocked, setIsLocked] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authenticatingRef = useRef(false);

  const shouldLock = useCallback(() => {
    return isAndroidAppLockAvailablePlatform() && readDevicePreferences().appLockEnabled;
  }, []);

  const unlock = useCallback(async (reason = "Unlock Stovo") => {
    if (authenticatingRef.current) return;
    authenticatingRef.current = true;
    setIsAuthenticating(true);
    setError(null);
    try {
      const ok = await authenticateAppLock(reason);
      if (ok) {
        setIsLocked(false);
      } else {
        setIsLocked(true);
      }
    } catch {
      setError("Could not unlock. Try again.");
      setIsLocked(true);
    } finally {
      authenticatingRef.current = false;
      setIsAuthenticating(false);
    }
  }, []);

  useEffect(() => {
    if (!isAndroidAppLockAvailablePlatform()) return;

    if (shouldLock()) {
      setIsLocked(true);
      void unlock("Unlock Stovo");
    }

    let disposed = false;
    let listener: { remove: () => Promise<void> } | null = null;

    void (async () => {
      listener = await CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (disposed) return;
        if (!shouldLock()) {
          setIsLocked(false);
          return;
        }
        if (!isActive) {
          setIsLocked(true);
          return;
        }
        void unlock("Unlock Stovo");
      });
      if (disposed) {
        void listener.remove();
      }
    })();

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [shouldLock, unlock]);

  if (!isLocked || !isAndroidAppLockAvailablePlatform()) {
    return null;
  }

  return (
    <div className="app-lock-gate" role="dialog" aria-modal="true" aria-label="App locked">
      <div className="app-lock-gate-card">
        <span className="app-lock-gate-icon" aria-hidden="true">
          <LockKeyhole size={28} />
        </span>
        <h1>Stovo is locked</h1>
        <p>Use your device PIN, pattern, password, or biometrics to continue.</p>
        {error && <p className="error-text">{error}</p>}
        <button
          type="button"
          className="primary-button"
          disabled={isAuthenticating}
          onClick={() => void unlock("Unlock Stovo")}
        >
          {isAuthenticating ? "Waiting…" : "Unlock"}
        </button>
      </div>
    </div>
  );
}
