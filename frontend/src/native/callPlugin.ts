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
  setActiveVideoState(options: NativeVideoPictureInPictureState): Promise<PictureInPictureState>;
  isPictureInPictureSupported(): Promise<PictureInPictureState>;
  isPictureInPictureActive(): Promise<PictureInPictureState>;
  enterPictureInPictureIfPossible(): Promise<PictureInPictureState & { entered?: boolean }>;
  addListener(
    eventName: "proximityChange",
    listener: (event: { near: boolean }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "pictureInPictureChange",
    listener: (event: PictureInPictureState) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "pictureInPictureAction",
    listener: (event: PictureInPictureActionEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
};

export type PictureInPictureOwner = "none" | "call" | "video";

export type NativeVideoPictureInPictureState = {
  active: boolean;
  playing: boolean;
  chatId: string;
  messageId: string;
  fileId: string;
  positionSeconds: number;
  durationSeconds: number;
  width: number;
  height: number;
  revision: number;
};

export type PictureInPictureAction =
  | "play"
  | "pause"
  | "seek-backward"
  | "seek-forward";

export type PictureInPictureActionEvent = {
  action: PictureInPictureAction;
  videoState: NativeVideoPictureInPictureState;
};

export type PictureInPictureState = {
  active: boolean;
  supported: boolean;
  eligible: boolean;
  owner: PictureInPictureOwner;
  requestedOwner: PictureInPictureOwner;
  activeOwner: PictureInPictureOwner;
  callActive: boolean;
  video: boolean;
  chatId?: string | null;
  sessionId?: string | null;
  acceptedRevision: number;
  videoState?: NativeVideoPictureInPictureState | null;
  reason?: string;
};

const CallPlugin = registerPlugin<CallPluginNative>("CallPlugin");

function unavailablePictureInPictureState(): PictureInPictureState {
  return {
    active: false,
    supported: false,
    eligible: false,
    owner: "none",
    requestedOwner: "none",
    activeOwner: "none",
    callActive: false,
    video: false,
    acceptedRevision: -1,
    videoState: null,
  };
}

function isPictureInPictureAction(value: unknown): value is PictureInPictureAction {
  return (
    value === "play" ||
    value === "pause" ||
    value === "seek-backward" ||
    value === "seek-forward"
  );
}

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

export async function setNativeActiveVideoState(
  options: NativeVideoPictureInPictureState,
): Promise<PictureInPictureState | null> {
  if (!isNativeCallPluginAvailable()) return null;
  try {
    return await CallPlugin.setActiveVideoState(options);
  } catch {
    return null;
  }
}

export async function getNativePictureInPictureSupport(): Promise<PictureInPictureState> {
  if (!isNativeCallPluginAvailable()) return unavailablePictureInPictureState();
  try {
    return await CallPlugin.isPictureInPictureSupported();
  } catch {
    return unavailablePictureInPictureState();
  }
}

export async function getNativePictureInPictureState(): Promise<PictureInPictureState> {
  if (!isNativeCallPluginAvailable()) return unavailablePictureInPictureState();
  try {
    return await CallPlugin.isPictureInPictureActive();
  } catch {
    return unavailablePictureInPictureState();
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

export async function addPictureInPictureActionListener(
  onAction: (event: PictureInPictureActionEvent) => void,
): Promise<() => void> {
  if (!isNativeCallPluginAvailable()) return () => undefined;
  try {
    const handle = await CallPlugin.addListener(
      "pictureInPictureAction",
      (event: PictureInPictureActionEvent) => {
        if (!isPictureInPictureAction(event?.action)) return;
        onAction(event);
      },
    );
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      void handle.remove().catch(() => undefined);
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
