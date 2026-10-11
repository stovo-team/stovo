import { useEffect, useState } from "react";

export type CallUIPreferences = { autoHideControls: boolean; cameraFit: "fit" | "cover" };
const key = "stovo.call-ui-preferences";
const defaults: CallUIPreferences = { autoHideControls: false, cameraFit: "fit" };
const eventName = "stovo:call-ui-preferences";

export function readCallUIPreferences(): CallUIPreferences {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!parsed || typeof parsed !== "object") return { ...defaults };
    const value = parsed as Record<string, unknown>;
    return {
      autoHideControls: typeof value.autoHideControls === "boolean" ? value.autoHideControls : defaults.autoHideControls,
      cameraFit: value.cameraFit === "cover" || value.cameraFit === "fit" ? value.cameraFit : defaults.cameraFit,
    };
  } catch {
    return { ...defaults };
  }
}

export function writeCallUIPreferences(patch: Partial<CallUIPreferences>): CallUIPreferences {
  const current = readCallUIPreferences();
  const next: CallUIPreferences = {
    autoHideControls: typeof patch.autoHideControls === "boolean" ? patch.autoHideControls : current.autoHideControls,
    cameraFit: patch.cameraFit === "cover" || patch.cameraFit === "fit" ? patch.cameraFit : current.cameraFit,
  };
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Preferences are optional when storage is unavailable. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(eventName));
  return next;
}

export function useCallUIPreferences() {
  const [preferences, setPreferences] = useState(readCallUIPreferences);
  useEffect(() => {
    const sync = () => setPreferences(readCallUIPreferences());
    window.addEventListener(eventName, sync);
    return () => window.removeEventListener(eventName, sync);
  }, []);
  return { preferences, patchPreferences: (patch: Partial<CallUIPreferences>) => setPreferences(writeCallUIPreferences(patch)) };
}
