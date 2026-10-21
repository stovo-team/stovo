import { expect, it, vi } from "vitest";
import { forwardMessages } from "./forwardMessages";
import { forwardMessage, type Message } from "../../../api/chats";
vi.mock("../../../api/chats", () => ({ forwardMessage: vi.fn(), sendMessage: vi.fn() }));
it("keeps failed optimistic forwards visible when persistence fails", async () => {
  vi.mocked(forwardMessage).mockRejectedValue(new Error("Offline"));
  let rows: Message[] = [];
  const onError = vi.fn();
  await forwardMessages({ accessToken: "token", currentUser: null, targets: [{ id: "source", chatId: "a", content: "Hello", attachments: [] } as unknown as Message], targetChatId: "b", chats: [], onChatsUpdate: vi.fn(), onError,
    applyMessagesForChat: (_chatId, update) => { rows = typeof update === "function" ? update(rows) : update; }
  });
  expect(rows).toEqual([expect.objectContaining({ deliveryState: "failed", content: "Hello" })]);
  expect(onError).toHaveBeenCalledWith("Offline");
});
