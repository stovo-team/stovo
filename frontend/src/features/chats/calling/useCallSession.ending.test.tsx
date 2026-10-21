import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useCallSession } from "./useCallSession";
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
