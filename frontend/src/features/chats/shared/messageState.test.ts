import { describe, expect, it } from "vitest";

import type { Message } from "../../../api/chats";
import {
  createClientMessageId,
  inferOptimisticMessageType,
  markPendingMessageFailed,
  mergeIncomingMessage,
  mergeMessageLists,
  replaceMessage
} from "./messageState";

function baseMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    chatId: "chat-1",
    senderId: "user-1",
    senderDisplayName: "Ada",
    type: "text",
    content: "hello",
    attachments: [],
    reactions: [],
    statuses: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  } as Message;
}

describe("messageState", () => {
  it("creates a client message id", () => {
    expect(createClientMessageId()).toBeTruthy();
  });

  it("infers optimistic message types from files and text", () => {
    expect(inferOptimisticMessageType([], null)).toBe("text");
    expect(
      inferOptimisticMessageType(
        [{ mimeType: "image/png" } as Message["attachments"][number]],
        null
      )
    ).toBe("image");
    expect(
      inferOptimisticMessageType(
        [{ mimeType: "image/png" } as Message["attachments"][number]],
        "caption"
      )
    ).toBe("mixed");
  });

  it("merges incoming messages and reconciles pending client ids", () => {
    const pending = baseMessage({
      id: "temp",
      clientMessageId: "client-1",
      deliveryState: "sending"
    });
    const incoming = baseMessage({
      id: "server-1",
      clientMessageId: "client-1",
      content: "confirmed"
    });
    const merged = mergeIncomingMessage([pending], incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("server-1");
    expect(merged[0].clientMessageId).toBeUndefined();
  });

  it("merges message lists by id and sorts by createdAt", () => {
    const a = baseMessage({ id: "a", createdAt: "2024-01-01T00:00:00.000Z" });
    const b = baseMessage({ id: "b", createdAt: "2024-01-01T00:01:00.000Z" });
    expect(mergeMessageLists([b], [a]).map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("replaces and fails pending messages", () => {
    const current = [baseMessage({ id: "a" }), baseMessage({ id: "b", clientMessageId: "c1" })];
    expect(replaceMessage(current, baseMessage({ id: "a", content: "updated" }))[0].content).toBe(
      "updated"
    );
    const failed = markPendingMessageFailed(current, "c1", "offline");
    expect(failed[1].deliveryState).toBe("failed");
    expect(failed[1].deliveryError).toBe("offline");
  });
});
