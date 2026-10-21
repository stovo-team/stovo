import { expect, it } from "vitest";
import type { Chat } from "../../../api/chats";
import { projectLocalCallEnd } from "./localCallEndProjection";
const chat = { id: "chat", members: [] } as unknown as Chat;
it.each(["connecting", "outgoing", "in-call"] as const)("mirrors server history status when ending during %s", (phase) => {
  const result = projectLocalCallEnd({ chat, user: { id: "me", displayName: "Me" }, phase, callType: "audio", roomId: "room", peerId: "peer", duration: "00:42" });
  expect(result.message?.call?.status).toBe(phase === "in-call" ? "completed" : phase === "outgoing" ? "canceled" : "failed");
});
it("uses the acknowledged room from chat metadata when the media room ref is missing", () => {
  const result = projectLocalCallEnd({ chat: { ...chat, activeCall: { roomId: "known-room" } }, user: { id: "me", displayName: "Me" }, phase: "in-call", callType: "audio", roomId: null, peerId: null, duration: "00:01" });
  expect(result.message?.id).toBe("local-call:known-room");
  expect(result.message?.call?.roomId).toBe("known-room");
});
it("does not invent a history record without any acknowledged room identity", () => {
  const result = projectLocalCallEnd({ chat, user: { id: "me", displayName: "Me" }, phase: "outgoing", callType: "audio", roomId: null, peerId: null, duration: "00:00" });
  expect(result.message).toBeNull();
  expect(result.activeCall).toBeNull();
});
