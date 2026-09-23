import { describe, expect, it } from "vitest";
import { restoreAttachmentBlobs } from "./attachmentBlobRecovery";
import { reconstructFileFromQueuedAttachment } from "./messageOutboxProcessor";
import type { QueuedOutboxMessage } from "./messageOutboxStore";

function queuedMessage(blob?: Blob): QueuedOutboxMessage {
  return {
    id: "message-1", clientMessageId: "message-1", chatId: "chat-1", userId: "user-1", content: null,
    replyToMessageId: null, threadRootMessageId: null, mentionedUserIds: [],
    attachments: [{ id: "attachment-1", name: "document.pdf", mimeType: "application/pdf", size: 17, ...(blob ? { blob } : {}) }],
    createdAt: "2026-09-23T00:00:00.000Z", status: "queued", attemptCount: 0,
  };
}

describe("restoreAttachmentBlobs", () => {
  it("restores bytes from the durable message while preserving local queue state", async () => {
    const blob = new Blob(["durable PDF bytes"], { type: "application/pdf" });
    const snapshot = queuedMessage();
    snapshot.status = "failed";
    const [restored] = restoreAttachmentBlobs([snapshot], [queuedMessage(blob)]);

    expect(restored.status).toBe("failed");
    expect(await restored.attachments[0].blob?.text()).toBe("durable PDF bytes");
    expect(reconstructFileFromQueuedAttachment(restored.attachments[0]).size).toBe(17);
  });

  it("leaves metadata untouched when there is no matching durable attachment", () => {
    const [restored] = restoreAttachmentBlobs([queuedMessage()], []);
    expect(restored.attachments[0].blob).toBeUndefined();
    expect(restored.attachments[0].size).toBe(17);
  });

  it("falls back to in-memory bytes when a stale durable record has metadata only", async () => {
    const memoryBlob = new Blob(["recoverable bytes"], { type: "application/pdf" });
    const [restored] = restoreAttachmentBlobs([queuedMessage()], [queuedMessage()], [queuedMessage(memoryBlob)]);
    expect(await restored.attachments[0].blob?.text()).toBe("recoverable bytes");
    expect(reconstructFileFromQueuedAttachment(restored.attachments[0]).size).toBe(17);
  });

  it("falls back to durable bytes when the snapshot blob is incomplete", async () => {
    const snapshot = queuedMessage(new Blob(["truncated"]));
    const durable = queuedMessage(new Blob(["durable PDF bytes"]));
    const [restored] = restoreAttachmentBlobs([snapshot], [durable]);

    expect(await restored.attachments[0].blob?.text()).toBe("durable PDF bytes");
    expect(reconstructFileFromQueuedAttachment(restored.attachments[0]).size).toBe(17);
  });

  it("falls back to in-memory bytes when durable bytes are incomplete", async () => {
    const snapshot = queuedMessage();
    const durable = queuedMessage(new Blob(["truncated"]));
    const memory = queuedMessage(new Blob(["recoverable bytes"]));
    const [restored] = restoreAttachmentBlobs([snapshot], [durable], [memory]);

    expect(await restored.attachments[0].blob?.text()).toBe("recoverable bytes");
    expect(reconstructFileFromQueuedAttachment(restored.attachments[0]).size).toBe(17);
  });

  it("falls back to durable bytes when the snapshot base64 is malformed", async () => {
    const snapshot = queuedMessage();
    snapshot.attachments[0].dataBase64 = "not valid base64!";
    const durable = queuedMessage(new Blob(["durable PDF bytes"]));
    const [restored] = restoreAttachmentBlobs([snapshot], [durable]);

    expect(await restored.attachments[0].blob?.text()).toBe("durable PDF bytes");
    expect(reconstructFileFromQueuedAttachment(restored.attachments[0]).size).toBe(17);
  });
});
