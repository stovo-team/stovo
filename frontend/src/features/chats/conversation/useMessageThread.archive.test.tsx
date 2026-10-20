import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Chat, Message } from "../../../api/chats";
import { useMessageThread } from "./useMessageThread";
import { archiveMessage } from "../../../api/chats";
vi.mock("../../../api/chats", async (importOriginal) => ({ ...await importOriginal<typeof import("../../../api/chats")>(), archiveMessage: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it.each(["me", "other"])("closes save menu and caches a %s message in archive before server response", async (senderId) => {
  let resolve!: (message: Message) => void;
  vi.mocked(archiveMessage).mockReturnValue(new Promise((done) => { resolve = done; }));
  const source = { id: "source", chatId: "chat-1", senderId, content: "Hello", attachments: [], statuses: [], reactions: [], encryptionProtocol: "server_at_rest", createdAt: new Date().toISOString() } as unknown as Message;
  const chat = { id: "chat-1", type: "group", members: [] } as unknown as Chat;
  const target = { ...chat, id: "archive", type: "archive" } as Chat;
  let thread!: ReturnType<typeof useMessageThread>;
  const params = { chatId: chat.id, accessToken: "token", currentUser: { id: "me", displayName: "Me" }, selectedChat: chat, chatsRef: { current: [chat, target] }, isMobileViewport: false, socketRef: { current: null }, authRequest: vi.fn(), onChatsUpdate: vi.fn(), onSelectedChatUpdate: vi.fn(), onError: vi.fn(), focusComposerInput: vi.fn(), channelCommentsDisabledForViewer: false } as Parameters<typeof useMessageThread>[0];
  function Harness() { thread = useMessageThread(params); return null; }
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    act(() => root.render(<Harness />));
    act(() => thread.setMessageContextMenu({ message: source, x: 0, y: 0 }));
    let operation!: Promise<void>;
    act(() => { operation = thread.handleArchiveMessage(source); });
    expect(thread.messageContextMenu).toBeNull();
    expect(thread.messageCacheRef.current.archive).toEqual([expect.objectContaining({ content: "Hello", chatId: "archive", deliveryState: "sending" })]);
    await act(async () => { resolve({ ...source, id: "confirmed", chatId: "archive" }); await operation; });
    expect(thread.messageCacheRef.current.archive.map((message) => message.id)).toEqual(["confirmed"]);
  } finally { act(() => root.unmount()); container.remove(); }
});
