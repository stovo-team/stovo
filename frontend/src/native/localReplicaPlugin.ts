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
  getValue(options: { profileId: string; key: string }): Promise<{ value: string | null; replicaReady: boolean }>;
  setValue(options: { profileId: string; key: string; value: string }): Promise<{ replicaReady: boolean }>;
  getSyncCursor(options: { profileId: string }): Promise<{ cursor: string | null; replicaReady: boolean }>;
  setSyncCursor(options: { profileId: string; cursor: string }): Promise<{ replicaReady: boolean }>;
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

/** Prepares the account-scoped Keystore key used by the encrypted replica. */
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

/** Reads an encrypted native JSON value, or null when native storage is unavailable. */
export async function loadNativeReplicaValue(profileId: string, key: string): Promise<string | null> {
  if (!isAndroidLocalReplicaPlatform() || !profileId.trim() || !key.trim()) return null;
  const status = await prepareLocalReplicaProfile(profileId);
  if (!status.replicaReady) return null;
  try {
    const result = await LocalReplicaPlugin.getValue({ profileId, key });
    return result.replicaReady ? result.value : null;
  } catch {
    return null;
  }
}

/** Persists a JSON value through the Android Keystore-encrypted replica. */
export async function saveNativeReplicaValue(profileId: string, key: string, value: string): Promise<boolean> {
  if (!isAndroidLocalReplicaPlatform() || !profileId.trim() || !key.trim()) return false;
  const status = await prepareLocalReplicaProfile(profileId);
  if (!status.replicaReady) return false;
  try {
    const result = await LocalReplicaPlugin.setValue({ profileId, key, value });
    return result.replicaReady;
  } catch {
    return false;
  }
}

/**
 * Reads the account-scoped opaque cursor from Keystore-encrypted storage.
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

/** Persists the last fully applied delta cursor after local state is committed. */
export async function saveNativeReplicaSyncCursor(profileId: string, cursor: string): Promise<boolean> {
  if (!isAndroidLocalReplicaPlatform() || !profileId.trim() || !cursor.trim()) return false;
  const status = await prepareLocalReplicaProfile(profileId);
  if (!status.replicaReady) return false;
  try {
    const result = await LocalReplicaPlugin.setSyncCursor({ profileId, cursor });
    return result.replicaReady;
  } catch {
    return false;
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
