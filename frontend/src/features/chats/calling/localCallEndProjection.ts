import type { Chat, Message } from "../../../api/chats";
import type { CallPhase } from "../shared/types";
import { applyMessagePreviewToChat } from "../shared/chatPresentation";

export type CallEndProjection = { activeCall: Chat["activeCall"]; message: Message | null };

export function projectLocalCallEnd({ chat, user, phase, callType, roomId, peerId, duration, activeCall = chat.activeCall }: {
  chat: Chat;
  user: { id: string; displayName: string };
  phase: CallPhase;
  callType: "audio" | "video";
  roomId: string | null;
  peerId: string | null;
  duration: string;
  activeCall?: Chat["activeCall"];
}): CallEndProjection {
  const participants = (activeCall?.participants ?? []) as Array<{ userId: string; state: string }>;
  const liveParticipants = participants.filter((participant) => !["left", "declined"].includes(participant.state));
  const callerId = typeof activeCall?.callerId === "string" ? activeCall.callerId : user.id;
  // Mirrors the server: a nonhost ending a call with >2 live participants only leaves it.
  if (callerId !== user.id && liveParticipants.length > 2) {
    return { activeCall: { ...activeCall, participants: participants.map((participant) => participant.userId === user.id ? { ...participant, state: "left" } : participant) }, message: null };
  }
  // A room ID is needed to reconcile the eventual authoritative history message.
  roomId ??= typeof activeCall?.roomId === "string" ? activeCall.roomId : null;
  if (!roomId) return { activeCall: null, message: null };
  const createdAt = new Date().toISOString();
  const completed = phase === "in-call";
  const durationSeconds = duration.split(":").reduce((seconds, part) => seconds * 60 + Number(part), 0);
  const message: Message = {
    id: `local-call:${roomId}`, chatId: chat.id, senderId: callerId,
    senderDisplayName: callerId === user.id ? user.displayName : chat.members.find((member) => member.id === callerId)?.displayName ?? null,
    type: "call", content: null, encryptionProtocol: "legacy_plaintext", ciphertext: null, nonce: null, keyVersion: null, encryptionMetadata: null,
    replyToMessageId: null, threadRootMessageId: null, messageKind: "chat", createdAt, updatedAt: createdAt, deletedAt: null, isEdited: false,
    attachments: [], statuses: [], reactions: [],
    call: { roomId, status: completed ? "completed" : phase === "outgoing" ? "canceled" : "failed", callType, callerId, calleeId: typeof activeCall?.calleeId === "string" ? activeCall.calleeId : peerId ?? "", ...(completed ? { durationSeconds } : {}) }
  };
  return { activeCall: null, message };
}

export function applyCallEndToChat(chat: Chat, projection: CallEndProjection): Chat {
  const updated = { ...chat, activeCall: projection.activeCall };
  return projection.message ? applyMessagePreviewToChat(updated, projection.message) : updated;
}

export function maskLocalCallEnd(chat: Chat, endedRooms: Set<string>, leftRooms: Map<string, string>): Chat {
  const roomId = chat.activeCall?.roomId;
  if (typeof roomId !== "string") return chat;
  if (endedRooms.has(roomId)) return { ...chat, activeCall: null };
  const userId = leftRooms.get(roomId);
  const participants = chat.activeCall?.participants as Array<{ userId: string; state: string }> | undefined;
  if (!userId || !participants?.some((participant) => participant.userId === userId && participant.state !== "left")) return chat;
  return { ...chat, activeCall: { ...chat.activeCall, participants: participants.map((participant) => participant.userId === userId ? { ...participant, state: "left" } : participant) } };
}
