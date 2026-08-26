import { getMessage, type Message } from "../../../api/chats";
import { getFile, type FamilyFile } from "../../../api/files";
import { getSyncPage, type SyncEvent } from "../../../api/sync";
import { loadRecentChatHistory, mergeLatestHistory, saveRecentChatHistory } from "../../../chatHistoryCache";
import { loadCachedFileList, saveCachedFileList } from "../../../fileLibraryCache";
import {
  getNativeReplicaSyncCursor,
  isAndroidLocalReplicaPlatform,
  saveNativeReplicaSyncCursor,
} from "../../../native/localReplicaPlugin";

type DeltaSyncOptions = {
  accessToken: string;
  userId: string;
  onMessageCreated?: (message: Message) => Promise<void> | void;
  onFileChanged?: (fileId: string, file: FamilyFile | null) => Promise<void> | void;
};

function messageFromEvent(event: SyncEvent): Message | null {
  if (event.type !== "message.created" || !event.payload || typeof event.payload !== "object") return null;
  const message = event.payload as Partial<Message>;
  return typeof message.id === "string" && typeof message.chatId === "string" ? message as Message : null;
}

function messageIDFromChangedEvent(event: SyncEvent): string | null {
  if (event.type !== "message.changed" || !event.payload || typeof event.payload !== "object") return null;
  const messageId = (event.payload as { messageId?: unknown }).messageId;
  return typeof messageId === "string" && messageId.trim() ? messageId : null;
}

function fileIDFromEvent(event: SyncEvent): string | null {
  if (!event.type.startsWith("file.") || !event.payload || typeof event.payload !== "object") return null;
  const fileId = (event.payload as { fileId?: unknown }).fileId;
  return typeof fileId === "string" && fileId.trim() ? fileId : null;
}

async function persistMessageDelta(userId: string, message: Message): Promise<void> {
  const cached = await loadRecentChatHistory<Message>(userId, message.chatId);
  await saveRecentChatHistory(userId, message.chatId, mergeLatestHistory(cached ?? [], [message]));
}

async function persistFileDelta(accessToken: string, userId: string, event: SyncEvent, fileId: string): Promise<FamilyFile | null> {
  const cached = await loadCachedFileList<FamilyFile>(userId) ?? [];
  if (event.type === "file.deleted") {
    await saveCachedFileList(userId, cached.filter((file) => file.id !== fileId));
    return null;
  }
  try {
    const changed = await getFile(accessToken, fileId);
    const next = [changed, ...cached.filter((file) => file.id !== fileId)]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    await saveCachedFileList(userId, next);
    return changed;
  } catch {
    // A revoked membership or a concurrent delete must remove stale local
    // metadata; authorization remains owned by the authoritative endpoint.
    await saveCachedFileList(userId, cached.filter((file) => file.id !== fileId));
    return null;
  }
}

/**
 * Applies every fully committed page before advancing its opaque cursor. The
 * cursor is encrypted on Android and is never interpreted by the client.
 */
export async function syncChatReplicaDeltas({ accessToken, userId, onMessageCreated, onFileChanged }: DeltaSyncOptions): Promise<void> {
  if (!isAndroidLocalReplicaPlatform()) return;
  let cursor = await getNativeReplicaSyncCursor(userId);
  for (let pageCount = 0; pageCount < 10_000; pageCount += 1) {
    const page = await getSyncPage(accessToken, { cursor, limit: 200 });
    const previousCursor = cursor;
    for (const event of page.events) {
      const message = messageFromEvent(event);
      if (message) {
        await persistMessageDelta(userId, message);
        await onMessageCreated?.(message);
      }
      const changedMessageID = messageIDFromChangedEvent(event);
      if (changedMessageID) {
        const changed = await getMessage(accessToken, changedMessageID);
        await persistMessageDelta(userId, changed);
        await onMessageCreated?.(changed);
      }
      const fileId = fileIDFromEvent(event);
      if (fileId) {
        const file = await persistFileDelta(accessToken, userId, event, fileId);
        await onFileChanged?.(fileId, file);
      }
    }
    if (page.nextCursor && page.nextCursor !== cursor) {
      // Cursor acknowledgement follows local persistence, so a process death
      // can only replay a page. Message IDs make that replay idempotent.
      if (!(await saveNativeReplicaSyncCursor(userId, page.nextCursor))) return;
      cursor = page.nextCursor;
    }
    if (!page.hasMore) return;
    if (!page.nextCursor || page.nextCursor === previousCursor) {
      throw new Error("Sync page did not advance its cursor");
    }
  }
  throw new Error("Sync backlog exceeded the safety page limit");
}
