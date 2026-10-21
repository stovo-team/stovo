import { expect, it, vi } from "vitest";
import { saveMessagesToArchive } from "./saveMessagesToArchive";
import { archiveMessage, type Chat, type Message } from "../../../api/chats";
vi.mock("../../../api/chats", () => ({ archiveMessage: vi.fn() }));
it("retains a failed local archive copy and reports persistence failure", async () => {
  vi.mocked(archiveMessage).mockRejectedValue(new Error("Offline"));
  let rows: Message[] = [];
  const onError = vi.fn();
  await saveMessagesToArchive({ accessToken: "token", targets: [{ id: "source", chatId: "chat", content: "Note" } as Message], archive: { id: "archive" } as Chat, onChatsUpdate: vi.fn(), onError,
    applyMessagesForChat: (_id, update) => { rows = typeof update === "function" ? update(rows) : update; }
  });
  expect(rows).toEqual([expect.objectContaining({ deliveryState: "failed", content: "Note" })]);
  expect(onError).toHaveBeenCalledWith("Offline");
});
