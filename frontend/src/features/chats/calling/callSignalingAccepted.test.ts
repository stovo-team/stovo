import { describe, expect, it } from "vitest";
import { getMediaJoinFailureNotice } from "./callSignalingAccepted";

describe("media join failure notice", () => {
  it("reports an SFU disconnect as a connection failure, not a device failure", () => {
    expect(getMediaJoinFailureNotice(new Error("Client initiated disconnect"))).toBe(
      "Could not connect to the call. Check your connection and try again.",
    );
  });

  it("keeps a device permission error actionable", () => {
    const error = new Error("Microphone permission denied");
    error.name = "NotAllowedError";
    expect(getMediaJoinFailureNotice(error)).toBe("Camera/mic permission or device failed");
  });
});

it.each([[false, false], [true, false], [false, true], [true, true]])("ignores an obsolete media join (failure=%s, rejoined=%s)", async (fails, rejoined) => {
  const { vi } = await import("vitest");
  const { registerCallAcceptedHandler } = await import("./callSignalingAccepted");
  let accepted!: (payload: unknown) => void;
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((ok, no) => { resolve = ok; reject = no; });
  const setCallPhase = vi.fn();
  const resetCallState = vi.fn();
  const prepareForCall = vi.fn(async () => undefined);
  const phase = { current: "connecting" };
  const chat = { current: "voice-room" };
  const session = { current: "pending" };
  const dependencies = new Proxy({
    currentUser: { id: "self" },
    activeCallChatIdRef: chat, activeCallSessionIdRef: session, callPhaseRef: phase,
    callRoomIdRef: { current: null }, callTypeRef: { current: "audio" },
    chatsRef: { current: [{ id: "voice-room", type: "voice" }] },
    setCallPhase, resetCallState,
  }, { get: (target, key) => key in target ? target[key as keyof typeof target] : vi.fn() });
  const socket = { connected: true, on: (_event: string, handler: typeof accepted) => { accepted = handler; }, emit: vi.fn() };
  let generation = 0;
  registerCallAcceptedHandler(socket as never, { get sessionGeneration() { return generation; }, setRoomId() {}, setChatId() {}, setTopology() {}, setLocalUserId() {}, switchToSfu: () => pending, prepareForCall } as never, dependencies as never);
  accepted({ chatId: "voice-room", roomId: "room", topology: "sfu", callerId: "self", calleeId: "self", sessionStartedAt: "session-one" });
  setCallPhase.mockClear();
  generation++;
  if (!rejoined) { phase.current = "idle"; chat.current = null as never; session.current = null as never; }
  if (fails) reject(new Error("old connection closed")); else resolve();
  await pending.catch(() => undefined); await Promise.resolve(); await Promise.resolve();
  expect(setCallPhase).not.toHaveBeenCalled();
  expect(resetCallState).not.toHaveBeenCalled();
  expect(prepareForCall).not.toHaveBeenCalled();
  expect(socket.emit).not.toHaveBeenCalled();
});
