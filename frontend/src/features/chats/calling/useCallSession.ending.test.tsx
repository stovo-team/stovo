import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useCallSession } from "./useCallSession";
import { loadRecentChatHistoryFromLocalStorage } from "../../../chatHistoryCache";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it.each([true, false])("closes local call UI while media cleanup is pending (socket: %s)", async (withSocket) => {
  let finish!: () => void;
  const cleanup = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  const socket = { emit: vi.fn() };
  const params = { accessToken: null, currentUser: null, selectedChat: null, chats: [], members: [], chatId: "chat-1", navigate: vi.fn(), prefersReducedMotion: true, setError: vi.fn(), chatsRef: { current: [] }, activeChatIdRef: { current: "chat-1" }, messageCacheRef: { current: {} }, setSelectedChat: vi.fn(), setMessages: vi.fn(), setIsDetailsOpen: vi.fn(), socketRef: { current: withSocket ? socket : null }, restoreActiveVideoSurface: vi.fn(), setIsVideoPictureInPictureActive: vi.fn(), videoPictureInPictureActiveRef: { current: false }, lastNativeVideoRevisionRef: { current: 0 } } as unknown as Parameters<typeof useCallSession>[0];
  let call!: ReturnType<typeof useCallSession>;
  function Harness() { call = useCallSession(params); return null; }
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    act(() => root.render(<Harness />));
    act(() => { call.setCallPhase("in-call"); call.setActiveCallChatId("chat-1"); });
    call.audioCallRef.current = { cleanup } as unknown as NonNullable<typeof call.audioCallRef.current>;
    let operation!: Promise<void>;
    act(() => { operation = call.endActiveCall(); });
    expect(call.callPhase).toBe("idle");
    expect(call.activeCallChatId).toBeNull();
    expect(call.callNotice).toBeNull();
    if (withSocket) expect(socket.emit).toHaveBeenCalledWith("call:end", { chatId: "chat-1" });
    else expect(socket.emit).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledWith(true);
    await act(async () => { finish(); await operation; });
  } finally { act(() => root.unmount()); host.remove(); }
});
it.each([false, true])("projects terminal history or a continuing group locally (guest leaves: %s)", async (guestLeaves) => {
  const activeCall = { roomId: "room-1", callerId: guestLeaves ? "host" : "me", participants: [{ userId: "me", state: "connected" }, { userId: "host", state: "connected" }, ...(guestLeaves ? [{ userId: "third", state: "connected" }] : [])] };
  const chat = { id: "chat-1", type: "group", title: "Group", activeCall, members: [] } as unknown as import("../../../api/chats").Chat;
  const cache = { current: {} as Record<string, import("../../../api/chats").Message[]> };
  const mutationVersion = { current: {} as Record<string, number> };
  let chats = [chat];
  let finish!: () => void;
  const cleanup = () => new Promise<void>((resolve) => { finish = resolve; });
  const params = { accessToken: null, currentUser: { id: "me", displayName: "Me" }, selectedChat: chat, chats, members: [], chatId: chat.id, navigate: vi.fn(), prefersReducedMotion: true, setError: vi.fn(), chatsRef: { current: chats }, activeChatIdRef: { current: chat.id }, messageCacheRef: cache, setSelectedChat: vi.fn(), setMessages: vi.fn(), setIsDetailsOpen: vi.fn(), socketRef: { current: null }, restoreActiveVideoSurface: vi.fn(), setIsVideoPictureInPictureActive: vi.fn(), videoPictureInPictureActiveRef: { current: false }, lastNativeVideoRevisionRef: { current: 0 }, chatMutationVersionRef: mutationVersion, onChatsUpdate: (update: (current: typeof chats) => typeof chats) => { chats = update(chats); } } as unknown as Parameters<typeof useCallSession>[0];
  let call!: ReturnType<typeof useCallSession>;
  function Harness() { call = useCallSession(params); return null; }
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    act(() => root.render(<Harness />));
    act(() => { call.setCallPhase("in-call"); call.setActiveCallChatId(chat.id); });
    call.callPhaseRef.current = "in-call";
    call.callRoomIdRef.current = "room-1";
    call.audioCallRef.current = { cleanup } as unknown as NonNullable<typeof call.audioCallRef.current>;
    let operation!: Promise<void>;
    act(() => { operation = call.endActiveCall(); });
    expect(mutationVersion.current[chat.id]).toBe(1);
    if (guestLeaves) {
      expect(cache.current[chat.id] ?? []).toEqual([]);
      expect(chats[0].activeCall?.participants.find((p: { userId: string }) => p.userId === "me").state).toBe("left");
      expect(call.activeGroupCalls[chat.id]).toBeDefined();
    } else {
      expect(cache.current[chat.id]).toEqual([expect.objectContaining({ type: "call", call: expect.objectContaining({ roomId: "room-1", status: "completed" }) })]);
      expect(loadRecentChatHistoryFromLocalStorage("me", chat.id)).toEqual(cache.current[chat.id]);
      expect(chats[0].activeCall).toBeNull();
      expect(call.activeGroupCalls[chat.id]).toBeUndefined();
      act(() => { params.chats = [{ ...chat }]; root.render(<Harness />); });
      expect(call.activeGroupCalls[chat.id]).toBeUndefined();
    }
    await act(async () => { finish(); await operation; });
  } finally { act(() => root.unmount()); host.remove(); }
});
