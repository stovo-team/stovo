import { describe, expect, it, vi } from "vitest";
import type { LocalReplicaOperation } from "../../../native/localReplicaPlugin";

const replica = vi.hoisted(() => ({ operation: null as any }));
vi.mock("../../../native/localReplicaPlugin", () => ({
  isAndroidLocalReplicaPlatform: () => true,
  putNativeReplicaOperation: async (_userId: string, operation: LocalReplicaOperation) => { replica.operation = operation; return true; },
  listNativeReplicaOperations: async () => replica.operation ? [replica.operation] : [],
  removeNativeReplicaOperation: async () => { replica.operation = null; return true; },
}));

import { enqueueOutboxMessage, getOutboxMessages } from "./messageOutboxStore";
import { reconstructFileFromQueuedAttachment } from "./messageOutboxProcessor";

describe("Android attachment queue", () => {
  it("retains gallery image bytes after restoring the encrypted outbox", async () => {
    const blob = new Blob(["image bytes"], { type: "image/png" });
    await enqueueOutboxMessage({
      id: "message-1", clientMessageId: "message-1", chatId: "chat-1", userId: "user-1", content: null,
      replyToMessageId: null, threadRootMessageId: null, mentionedUserIds: [],
      attachments: [{ id: "photo-1", name: "photo.png", mimeType: "image/png", size: blob.size, blob, nativeSourceUri: "file:///cache/photo.png" }],
      createdAt: "2026-11-19T00:00:00Z", status: "queued", attemptCount: 0,
    });
    const [restored] = await getOutboxMessages("user-1");
    expect(atob(restored.attachments[0].dataBase64!)).toBe("image bytes");
    const file = reconstructFileFromQueuedAttachment(restored.attachments[0]);
    expect(file.size).toBe(blob.size);
    expect(file.name).toBe("photo.png");
  });
});
