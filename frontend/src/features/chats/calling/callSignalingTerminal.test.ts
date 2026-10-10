import { describe, expect, it, vi } from "vitest";
import { registerCallTerminalHandlers } from "./callSignalingTerminal";

describe("call terminal signaling", () => {
  it("joins the existing chat session after a duplicate start conflict", () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const socket = {
      on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler),
      emit: vi.fn(),
    };
    const resetCallState = vi.fn();
    const setError = vi.fn();
    const dependencies = new Proxy({
      activeCallChatIdRef: { current: "chat-1" },
      activeCallSessionIdRef: { current: "pending" },
      callPhaseRef: { current: "outgoing" },
      callTypeRef: { current: "video" },
      resetCallState,
      setError,
    }, {
      get: (target, key) => key in target ? target[key as keyof typeof target] : vi.fn(),
    });

    registerCallTerminalHandlers(socket as never, {} as never, dependencies as never, () => false);
    handlers.get("call:error")?.({
      chatId: "chat-1",
      message: "call already in progress for this chat",
    });

    expect(socket.emit).toHaveBeenCalledWith("call:join", { chatId: "chat-1", callType: "video" });
    expect(resetCallState).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });
});
