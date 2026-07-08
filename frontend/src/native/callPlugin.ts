import { Capacitor, registerPlugin } from "@capacitor/core";

type CallPluginNative = {
  enableCallMode(options: { earpiece: boolean }): Promise<void>;
  disableCallMode(): Promise<void>;
  setAudioRoute(options: { earpiece: boolean }): Promise<void>;
  setActiveCallState(options: {
    active: boolean;
    video: boolean;
    chatId?: string | null;
    sessionId?: string | null;
  }): Promise<PictureInPictureState>;
  isPictureInPictureSupported(): Promise<PictureInPictureState>;
  isPictureInPictureActive(): Promise<PictureInPictureState>;
  enterPictureInPictureIfPossible(): Promise<PictureInPictureState & { entered?: boolean }>;
  addListener(
    eventName: "proximityChange" | "pictureInPictureChange",
    listener: ((event: { near: boolean }) => void) | ((event: PictureInPictureState) => void)
  ): Promise<{ remove: () => Promise<void> }>;
};

export type PictureInPictureState = {
  active: boolean;
  supported: boolean;
  eligible: boolean;
  callActive: boolean;
  video: boolean;
  chatId?: string | null;
  sessionId?: string | null;
  reason?: string;
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
    const handle = await CallPlugin.addListener("proximityChange", (event: { near: boolean }) => {
      onChange(Boolean(event.near));
    });
    return () => {
      void handle.remove();
    };
  } catch {
    return () => undefined;
  }
}

export async function setNativeActiveCallState(options: {
  active: boolean;
  video: boolean;
  chatId?: string | null;
  sessionId?: string | null;
}): Promise<PictureInPictureState | null> {
  if (!isNativeCallPluginAvailable()) return null;
  try {
    return await CallPlugin.setActiveCallState(options);
  } catch {
    return null;
  }
}

export async function getNativePictureInPictureSupport(): Promise<PictureInPictureState> {
  if (!isNativeCallPluginAvailable()) {
    return {
      active: false,
      supported: false,
      eligible: false,
      callActive: false,
      video: false,
    };
  }
  try {
    return await CallPlugin.isPictureInPictureSupported();
  } catch {
    return {
      active: false,
      supported: false,
      eligible: false,
      callActive: false,
      video: false,
    };
  }
}

export async function getNativePictureInPictureState(): Promise<PictureInPictureState> {
  if (!isNativeCallPluginAvailable()) {
    return {
      active: false,
      supported: false,
      eligible: false,
      callActive: false,
      video: false,
    };
  }
  try {
    return await CallPlugin.isPictureInPictureActive();
  } catch {
    return {
      active: false,
      supported: false,
      eligible: false,
      callActive: false,
      video: false,
    };
  }
}

export async function enterNativePictureInPictureIfPossible(): Promise<boolean> {
  if (!isNativeCallPluginAvailable()) return false;
  try {
    const result = await CallPlugin.enterPictureInPictureIfPossible();
    return Boolean(result.entered);
  } catch {
    return false;
  }
}

export async function addPictureInPictureListener(
  onChange: (state: PictureInPictureState) => void
): Promise<() => void> {
  if (!isNativeCallPluginAvailable()) return () => undefined;
  try {
    const handle = await CallPlugin.addListener("pictureInPictureChange", (event: PictureInPictureState) => {
      onChange(event);
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
