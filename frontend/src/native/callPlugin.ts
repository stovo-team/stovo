import { Capacitor, registerPlugin } from "@capacitor/core";

type CallPluginNative = {
  enableCallMode(options: { earpiece: boolean }): Promise<void>;
  disableCallMode(): Promise<void>;
  setAudioRoute(options: { earpiece: boolean }): Promise<void>;
  addListener(
    eventName: "proximityChange",
    listener: (event: { near: boolean }) => void
  ): Promise<{ remove: () => Promise<void> }>;
};

const CallPlugin = registerPlugin<CallPluginNative>("CallPlugin");

export function isNativeCallPluginAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function enableNativeCallMode(earpiece: boolean): Promise<void> {
  if (!isNativeCallPluginAvailable()) return;
  try {
    await CallPlugin.enableCallMode({ earpiece });
  } catch {
    // Plugin unavailable or sensor missing — non-fatal.
  }
}

export async function disableNativeCallMode(): Promise<void> {
  if (!isNativeCallPluginAvailable()) return;
  try {
    await CallPlugin.disableCallMode();
  } catch {
    // Non-fatal.
  }
}

export async function setNativeAudioRoute(earpiece: boolean): Promise<void> {
  if (!isNativeCallPluginAvailable()) return;
  try {
    await CallPlugin.setAudioRoute({ earpiece });
  } catch {
    // Non-fatal.
  }
}

export async function addProximityListener(
  onChange: (near: boolean) => void
): Promise<() => void> {
  if (!isNativeCallPluginAvailable()) return () => undefined;
  try {
    const handle = await CallPlugin.addListener("proximityChange", (event) => {
      onChange(Boolean(event.near));
    });
    return () => {
      void handle.remove();
    };
  } catch {
    return () => undefined;
  }
}

/**
 * Returns false only when the microphone permission is permanently denied on
 * Android (user tapped "Don't allow"). In all other states (granted, prompt,
 * or when the Permissions API is unavailable) returns true so getUserMedia can
 * surface a more specific error if needed.
 */
export async function ensureNativeMicrophonePermission(): Promise<boolean> {
  // On web getUserMedia handles the permission prompt natively.
  if (!isNativeCallPluginAvailable()) return true;
  try {
    if (typeof navigator !== "undefined" && navigator.permissions) {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (result.state === "denied") return false;
    }
  } catch {
    // Permissions API not supported in this WebView version — proceed and let
    // getUserMedia surface the denial as NotAllowedError if needed.
  }
  return true;
}

/**
 * Same as ensureNativeMicrophonePermission but for camera.
 */
export async function ensureNativeCameraPermission(): Promise<boolean> {
  if (!isNativeCallPluginAvailable()) return true;
  try {
    if (typeof navigator !== "undefined" && navigator.permissions) {
      const result = await navigator.permissions.query({ name: "camera" as PermissionName });
      if (result.state === "denied") return false;
    }
  } catch {
    // Permissions API not supported — proceed.
  }
  return true;
}
