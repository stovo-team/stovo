import { Capacitor, registerPlugin } from "@capacitor/core";

export type LocalReplicaStatus = {
  supported: boolean;
  keyReady: boolean;
  schemaVersion: number;
  replicaReady: boolean;
  migrationState: "scaffold" | "ready";
};

export type LocalReplicaOperationStatus = "queued" | "running" | "retry" | "failed" | "completed" | "cancelled";

/** Wire-safe operation record for the future native encrypted outbox. */
export type LocalReplicaOperation = {
  id: string;
  type: string;
  payloadJson: string;
  payloadHash: string;
  dependencies: string[];
  status: LocalReplicaOperationStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  retryAt?: string | null;
  errorCode?: string | null;
};

type NativeLocalReplicaPlugin = {
  getStatus(options?: { profileId?: string }): Promise<LocalReplicaStatus>;
  prepareProfile(options: { profileId: string }): Promise<LocalReplicaStatus>;
  clearProfile(options: { profileId: string }): Promise<LocalReplicaStatus>;
  getSyncCursor(options: { profileId: string }): Promise<{ cursor: string | null; replicaReady: boolean }>;
  listOperations(options: { profileId: string; statuses?: LocalReplicaOperationStatus[] }): Promise<{
    operations: LocalReplicaOperation[];
    replicaReady: boolean;
  }>;
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

/**
 * Returns null until a native replica is fully migrated. Callers must retain
 * their existing server/cache sync path when this returns null.
 */
export async function getNativeReplicaSyncCursor(profileId: string): Promise<string | null> {
  const status = await getLocalReplicaStatus(profileId);
  if (!status.replicaReady || !profileId.trim()) return null;
  try {
    const result = await LocalReplicaPlugin.getSyncCursor({ profileId });
    return result.replicaReady ? result.cursor : null;
  } catch {
    return null;
  }
}

/**
 * Returns an empty list until operation persistence is shipped. It is not a
 * replacement for the existing message outbox during the scaffold phase.
 */
export async function listNativeReplicaOperations(
  profileId: string,
  statuses?: LocalReplicaOperationStatus[]
): Promise<LocalReplicaOperation[]> {
  const status = await getLocalReplicaStatus(profileId);
  if (!status.replicaReady || !profileId.trim()) return [];
  try {
    const result = await LocalReplicaPlugin.listOperations({ profileId, statuses });
    return result.replicaReady && Array.isArray(result.operations) ? result.operations : [];
  } catch {
    return [];
  }
}
