import { describe, expect, it } from "vitest";
import { restoreAttachmentBlobs } from "./attachmentBlobRecovery";
import type { QueuedOutboxMessage } from "./messageOutboxStore";

function queuedMessage(blob?: Blob): QueuedOutboxMessage {
  return {
    id: "message-1", clientMessageId: "message-1", chatId: "chat-1", userId: "user-1", content: null,
    replyToMessageId: null, threadRootMessageId: null, mentionedUserIds: [],
    attachments: [{ id: "attachment-1", name: "document.pdf", mimeType: "application/pdf", size: 18, ...(blob ? { blob } : {}) }],
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
  });

  it("leaves metadata untouched when there is no matching durable attachment", () => {
    const [restored] = restoreAttachmentBlobs([queuedMessage()], []);
    expect(restored.attachments[0].blob).toBeUndefined();
    expect(restored.attachments[0].size).toBe(18);
  });
});
