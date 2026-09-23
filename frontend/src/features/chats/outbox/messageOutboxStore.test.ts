import { describe, expect, it, beforeEach } from "vitest";
import {
  clearOutbox,
  enqueueOutboxMessage,
  getOutboxMessages,
  getOutboxMessagesForChat,
  removeOutboxMessage,
  updateOutboxMessage,
  type QueuedOutboxMessage
} from "./messageOutboxStore";

describe("messageOutboxStore", () => {
  beforeEach(async () => {
    await clearOutbox();
  });

  const createSampleMessage = (id: string, chatId = "chat-1", userId = "user-1"): QueuedOutboxMessage => ({
    id,
    clientMessageId: id,
    chatId,
    userId,
    content: `Hello ${id}`,
    replyToMessageId: null,
    threadRootMessageId: null,
    mentionedUserIds: [],
    attachments: [],
    createdAt: new Date().toISOString(),
    status: "queued",
    attemptCount: 0
  });

  it("enqueues and retrieves messages for a user", async () => {
    const msg1 = createSampleMessage("msg-1");
    const msg2 = createSampleMessage("msg-2");

    await enqueueOutboxMessage(msg1);
    await enqueueOutboxMessage(msg2);

    const retrieved = await getOutboxMessages("user-1");
    expect(retrieved).toHaveLength(2);
    expect(retrieved.map((m) => m.id)).toEqual(["msg-1", "msg-2"]);
  });

  it("keeps queued attachment bytes available after writing the local-storage snapshot", async () => {
    const message = createSampleMessage("msg-with-file");
    const attachment = new Blob(["non-empty PDF bytes"], { type: "application/pdf" });
    message.attachments = [{
      id: "file-1",
      name: "document.pdf",
      mimeType: "application/pdf",
      size: attachment.size,
      blob: attachment,
    }];

    await enqueueOutboxMessage(message);

    const [retrieved] = await getOutboxMessages("user-1");
    expect(retrieved.attachments[0].blob).toBeInstanceOf(Blob);
    expect(await retrieved.attachments[0].blob?.text()).toBe("non-empty PDF bytes");
  });

  it("filters messages by chat", async () => {
    const msg1 = createSampleMessage("msg-1", "chat-1");
    const msg2 = createSampleMessage("msg-2", "chat-2");

    await enqueueOutboxMessage(msg1);
    await enqueueOutboxMessage(msg2);

    const chat1Messages = await getOutboxMessagesForChat("user-1", "chat-1");
    expect(chat1Messages).toHaveLength(1);
    expect(chat1Messages[0].id).toBe("msg-1");
  });

  it("updates an outbox message", async () => {
    const msg = createSampleMessage("msg-1");
    await enqueueOutboxMessage(msg);

    await updateOutboxMessage("msg-1", "user-1", { status: "sending", attemptCount: 1 });

    const messages = await getOutboxMessages("user-1");
    expect(messages[0].status).toBe("sending");
    expect(messages[0].attemptCount).toBe(1);
  });

  it("removes a message from the outbox", async () => {
    const msg1 = createSampleMessage("msg-1");
    const msg2 = createSampleMessage("msg-2");

    await enqueueOutboxMessage(msg1);
    await enqueueOutboxMessage(msg2);

    await removeOutboxMessage("msg-1", "user-1");

    const messages = await getOutboxMessages("user-1");
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("msg-2");
  });
});
