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
