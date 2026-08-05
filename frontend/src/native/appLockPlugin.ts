import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeAppLockPlugin = {
  isAvailable(): Promise<{ available: boolean; biometrics: boolean; deviceCredential: boolean }>;
  authenticate(options?: { reason?: string }): Promise<{ authenticated: boolean }>;
};

const AppLockPlugin = registerPlugin<NativeAppLockPlugin>("AppLockPlugin");

export function isAndroidAppLockAvailablePlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function getAppLockAvailability(): Promise<{
  available: boolean;
  biometrics: boolean;
  deviceCredential: boolean;
}> {
  if (!isAndroidAppLockAvailablePlatform()) {
    return { available: false, biometrics: false, deviceCredential: false };
  }
  try {
    return await AppLockPlugin.isAvailable();
  } catch {
    return { available: false, biometrics: false, deviceCredential: false };
  }
}

export async function authenticateAppLock(reason = "Unlock Stovo"): Promise<boolean> {
  if (!isAndroidAppLockAvailablePlatform()) return false;
  try {
    const result = await AppLockPlugin.authenticate({ reason });
    return result.authenticated === true;
  } catch {
    return false;
  }
}
