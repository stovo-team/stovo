import { afterEach, describe, expect, it, vi } from "vitest";
import { getOutboxMessages, type QueuedOutboxMessage } from "./messageOutboxStore";

const { durableRows, calls } = vi.hoisted(() => {
  const durableRows: QueuedOutboxMessage[] = [];
  const calls = { open: vi.fn(), transaction: vi.fn(), getAll: vi.fn() };
  return { durableRows, calls };
});

vi.mock("./outboxDatabase", () => ({
  OUTBOX_DATABASE_NAME: "stovo-outbox-v1",
  OUTBOX_STORE_NAME: "outbox_messages",
  openOutboxDatabase: vi.fn(async () => {
    calls.open();
    return {
      transaction: () => {
        calls.transaction();
        return {
          objectStore: () => ({
            index: () => ({
              getAll: () => {
                calls.getAll();
                const request: { result?: QueuedOutboxMessage[]; onsuccess?: () => void } = {
                  result: durableRows,
                };
                queueMicrotask(() => request.onsuccess?.());
                return request;
              },
            }),
          }),
        };
      },
      close: vi.fn(),
    };
  }),
}));

describe("messageOutboxStore reload hydration", () => {
  afterEach(() => {
    localStorage.clear();
    durableRows.length = 0;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("restores attachment bytes from the durable row without a same-session memory copy", async () => {
    const blob = new Blob(["durable PDF bytes"], { type: "application/pdf" });
    const snapshot: QueuedOutboxMessage = {
      id: "message-1", clientMessageId: "message-1", chatId: "chat-1", userId: "user-1", content: null,
      replyToMessageId: null, threadRootMessageId: null, mentionedUserIds: [],
      attachments: [{ id: "attachment-1", name: "document.pdf", mimeType: "application/pdf", size: blob.size }],
      createdAt: "2026-09-23T00:00:00.000Z", status: "queued", attemptCount: 0,
    };
    durableRows.push({ ...snapshot, attachments: [{ ...snapshot.attachments[0], blob }] });
    localStorage.setItem("stovo_outbox_queue_user-1", JSON.stringify([snapshot]));
    vi.stubGlobal("indexedDB", {});

    const [restored] = await getOutboxMessages("user-1");

    expect(calls.open).toHaveBeenCalledOnce();
    expect(calls.transaction).toHaveBeenCalledOnce();
    expect(calls.getAll).toHaveBeenCalledOnce();
    expect(await restored.attachments[0].blob?.text()).toBe("durable PDF bytes");
  });
});
