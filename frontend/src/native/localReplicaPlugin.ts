import { Capacitor, registerPlugin } from "@capacitor/core";

export type LocalReplicaStatus = {
  supported: boolean;
  keyReady: boolean;
  schemaVersion: number;
  replicaReady: boolean;
  migrationState: "scaffold" | "ready";
};

type NativeLocalReplicaPlugin = {
  getStatus(options?: { profileId?: string }): Promise<LocalReplicaStatus>;
  prepareProfile(options: { profileId: string }): Promise<LocalReplicaStatus>;
  clearProfile(options: { profileId: string }): Promise<LocalReplicaStatus>;
};

const LocalReplicaPlugin = registerPlugin<NativeLocalReplicaPlugin>("LocalReplicaPlugin");

const unavailable: LocalReplicaStatus = {
  supported: false,
  keyReady: false,
  schemaVersion: 0,
  replicaReady: false,
  migrationState: "scaffold"
};

export function isAndroidLocalReplicaPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function getLocalReplicaStatus(profileId?: string): Promise<LocalReplicaStatus> {
  if (!isAndroidLocalReplicaPlatform()) return unavailable;
  try {
    return await LocalReplicaPlugin.getStatus(profileId ? { profileId } : undefined);
  } catch {
    return unavailable;
  }
}

/** Prepares the account-scoped Keystore key without opting the account into the replica yet. */
export async function prepareLocalReplicaProfile(profileId: string): Promise<LocalReplicaStatus> {
  if (!isAndroidLocalReplicaPlatform() || !profileId.trim()) return unavailable;
  try {
    return await LocalReplicaPlugin.prepareProfile({ profileId });
  } catch {
    return unavailable;
  }
}

/** Removes native replica key material; callers must separately clear their legacy web cache. */
export async function clearLocalReplicaProfile(profileId: string): Promise<void> {
  if (!isAndroidLocalReplicaPlatform() || !profileId.trim()) return;
  try {
    await LocalReplicaPlugin.clearProfile({ profileId });
  } catch {
    // Logout/cache cleanup must remain best-effort even if the platform bridge fails.
  }
}
