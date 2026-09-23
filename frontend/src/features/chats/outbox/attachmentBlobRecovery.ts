import type { QueuedOutboxMessage } from "./messageOutboxStore";
import { openOutboxDatabase, OUTBOX_STORE_NAME } from "./outboxDatabase";

function validatedAttachmentBytes(attachment: QueuedOutboxMessage["attachments"][number]): Pick<QueuedOutboxMessage["attachments"][number], "blob" | "dataBase64"> | null {
  if (!Number.isSafeInteger(attachment.size) || attachment.size <= 0) return null;
  if (attachment.blob?.size === attachment.size) return { blob: attachment.blob, dataBase64: attachment.dataBase64 };
  if (!attachment.dataBase64) return null;

  try {
    const decoded = atob(attachment.dataBase64);
    if (decoded.length !== attachment.size) return null;
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
    return { blob: new Blob([bytes], { type: attachment.mimeType }), dataBase64: attachment.dataBase64 };
  } catch {
    return null;
  }
}

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
        const durable = durableAttachments.get(attachment.id);
        const memory = memoryAttachments.get(attachment.id);
        for (const candidate of [attachment, durable, memory]) {
          if (!candidate) continue;
          const bytes = validatedAttachmentBytes(candidate);
          if (bytes) return { ...attachment, ...bytes };
        }
        const { blob: _invalidBlob, dataBase64: _invalidData, ...metadata } = attachment;
        return metadata;
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
