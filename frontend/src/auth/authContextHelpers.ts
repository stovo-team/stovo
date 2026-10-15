import { ApiError } from "../api/client";
import { clearRecentChatHistory } from "../chatHistoryCache";
import { clearCachedFileLists } from "../fileLibraryCache";
import { clearPersistentMediaBlobCache } from "../mediaBlobCache";
import { clearApiResponseCache } from "../api/apiResponseCache";
import { clearOutbox } from "../features/chats/outbox/messageOutboxStore";
import { clearLocalReplicaProfile } from "../native/localReplicaPlugin";
import { MultiServerState, ServerAccount } from "../api/serverRegistry";

export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (error instanceof TypeError) return true;
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    return status === 0 || status === 408 || status === 502 || status === 503 || status === 504;
  }
  return false;
}

export function selectActiveServer(state: MultiServerState): ServerAccount | null {
  if (!state.activeServerId) return null;
  return state.servers[state.activeServerId] ?? null;
}

export function selectSavedServers(state: MultiServerState): ServerAccount[] {
  return Object.values(state.servers).filter((server) => {
    if (!server.url) return false;
    const hasCredentials = Boolean(server.accessToken || server.refreshToken || server.user);
    return server.id === state.activeServerId || hasCredentials;
  });
}

export async function clearAuthSession(profileId: string | null): Promise<void> {
  await Promise.allSettled([
    clearRecentChatHistory(),
    clearCachedFileLists(),
    clearPersistentMediaBlobCache(),
    clearApiResponseCache(profileId),
    clearOutbox(),
    ...(profileId ? [clearLocalReplicaProfile(profileId)] : []),
  ]);
}

export function isExpiredAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
