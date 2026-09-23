import type { QueuedOutboxMessage } from "./messageOutboxStore";
import { openOutboxDatabase, OUTBOX_STORE_NAME } from "./outboxDatabase";

export function restoreAttachmentBlobs(
  snapshot: QueuedOutboxMessage[],
  durable: QueuedOutboxMessage[],
  inMemory: QueuedOutboxMessage[] = [],
): QueuedOutboxMessage[] {
  const durableById = new Map(durable.map((message) => [message.id, message]));
  const memoryById = new Map(inMemory.map((message) => [message.id, message]));
  return snapshot.map((message) => {
    const durableAttachments = new Map((durableById.get(message.id)?.attachments ?? []).map((attachment) => [attachment.id, attachment]));
    const memoryAttachments = new Map((memoryById.get(message.id)?.attachments ?? []).map((attachment) => [attachment.id, attachment]));
    return {
      ...message,
      attachments: message.attachments.map((attachment) => {
        if (attachment.blob || attachment.dataBase64) return attachment;
        const durable = durableAttachments.get(attachment.id);
        const stored = durable?.blob || durable?.dataBase64 ? durable : memoryAttachments.get(attachment.id);
        return stored?.blob || stored?.dataBase64 ? { ...attachment, blob: stored.blob, dataBase64: stored.dataBase64 } : attachment;
      }),
    };
  });
}

export async function hydrateAttachmentBlobs(
  userId: string,
  snapshot: QueuedOutboxMessage[],
  inMemory: QueuedOutboxMessage[],
): Promise<QueuedOutboxMessage[]> {
  if (typeof indexedDB === "undefined") return restoreAttachmentBlobs(snapshot, [], inMemory);
  try {
    const db = await openOutboxDatabase();
    const durable = await new Promise<QueuedOutboxMessage[]>((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE_NAME, "readonly");
      const request = tx.objectStore(OUTBOX_STORE_NAME).index("userId").getAll(userId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
    db.close();
    return restoreAttachmentBlobs(snapshot, durable, inMemory);
  } catch {
    return restoreAttachmentBlobs(snapshot, [], inMemory);
  }
}
