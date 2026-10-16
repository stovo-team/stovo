import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { LockKeyhole } from "lucide-react";
import { PopupButton } from "./components/ui/PopupButton";

import {
  authenticateAppLock,
  isAndroidAppLockAvailablePlatform
} from "./native/appLockPlugin";
import { readDevicePreferences } from "./settings/devicePreferences";
import { useStrings } from "./i18n/LanguageContext";

/**
 * Full-screen gate that locks the Android app behind device PIN / biometrics
 * whenever App Lock is enabled in device preferences.
 */
export default function AppLockGate() {
  const strings = useStrings().security.appLock;
  const [isLocked, setIsLocked] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authenticatingRef = useRef(false);

  const shouldLock = useCallback(() => {
    return isAndroidAppLockAvailablePlatform() && readDevicePreferences().appLockEnabled;
  }, []);

  const unlock = useCallback(async (reason = strings.unlockReason) => {
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
      setError(strings.unlockFailed);
      setIsLocked(true);
    } finally {
      authenticatingRef.current = false;
      setIsAuthenticating(false);
    }
  }, [strings]);

  useEffect(() => {
    if (!isAndroidAppLockAvailablePlatform()) return;

    if (shouldLock()) {
      setIsLocked(true);
      void unlock(strings.unlockReason);
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
        void unlock(strings.unlockReason);
      });
      if (disposed) {
        void listener.remove();
      }
    })();

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [shouldLock, strings.unlockReason, unlock]);

  if (!isLocked || !isAndroidAppLockAvailablePlatform()) {
    return null;
  }

  return (
    <div className="app-lock-gate" role="dialog" aria-modal="true" aria-label={strings.locked}>
      <div className="app-lock-gate-card">
        <span className="app-lock-gate-icon" aria-hidden="true">
          <LockKeyhole size={28} />
        </span>
        <h1>{strings.title}</h1>
        <p>{strings.unlockHelp}</p>
        {error && <p className="error-text">{error}</p>}
        <PopupButton
          type="button"
          variant="primary"
          disabled={isAuthenticating}
          onClick={() => void unlock(strings.unlockReason)}
        >
          {isAuthenticating ? strings.waiting : strings.unlock}
        </PopupButton>
      </div>
    </div>
  );
}
