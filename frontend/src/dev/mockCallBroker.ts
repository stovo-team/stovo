export type MockCallParticipantState = "ringing" | "connected" | "declined" | "left";

export type MockCallParticipant = {
  userId: string;
  state: MockCallParticipantState;
};

export type MockCallSnapshot = {
  id: string;
  chatId: string;
  callType: "audio" | "video";
  callerId: string;
  participants: MockCallParticipant[];
  screenShareUserId: string | null;
  status: "ringing" | "active" | "ended";
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateMockCallInput = {
  id: string;
  chatId: string;
  callType: "audio" | "video";
  callerId: string;
  inviteeIds: string[];
  now?: Date;
};

export const MOCK_CALL_STORAGE_KEY = "stovo.localMockCall";
const MOCK_CALL_CHANNEL_NAME = "stovo.localMockCall.events";
const MAX_MOCK_CALL_AGE_MS = 4 * 60 * 60 * 1000;

let channel: BroadcastChannel | null = null;
const subscribers = new Set<(call: MockCallSnapshot | null) => void>();
let storageListener: ((event: StorageEvent) => void) | null = null;

function notify(call: MockCallSnapshot | null): void {
  for (const subscriber of subscribers) subscriber(call);
}

function ensureChannel(): void {
  if (typeof BroadcastChannel !== "undefined" && !channel) {
    channel = new BroadcastChannel(MOCK_CALL_CHANNEL_NAME);
    channel.addEventListener("message", (event: MessageEvent<MockCallSnapshot | null>) => {
      notify(event.data);
    });
  }
  if (typeof window !== "undefined" && !storageListener) {
    storageListener = (event) => {
      if (event.key !== MOCK_CALL_STORAGE_KEY) return;
      notify(parseMockCallSnapshot(event.newValue));
    };
    window.addEventListener("storage", storageListener);
  }
}

function parseMockCallSnapshot(raw: string | null): MockCallSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as MockCallSnapshot;
    if (
      typeof value.id !== "string" ||
      typeof value.chatId !== "string" ||
      typeof value.callerId !== "string" ||
      !Array.isArray(value.participants) ||
      (value.status !== "ringing" && value.status !== "active" && value.status !== "ended")
    ) return null;
    if (Date.now() - Date.parse(value.updatedAt) > MAX_MOCK_CALL_AGE_MS) return null;
    const screenShareUserId = typeof value.screenShareUserId === "string" && value.screenShareUserId.trim()
      ? value.screenShareUserId
      : null;
    const hasConnectedOwner = screenShareUserId !== null && value.participants.some((participant) =>
      participant?.userId === screenShareUserId && participant.state === "connected",
    );
    return { ...value, screenShareUserId: hasConnectedOwner ? screenShareUserId : null };
  } catch {
    return null;
  }
}

function withUpdatedParticipant(
  call: MockCallSnapshot,
  userId: string,
  state: MockCallParticipantState,
): MockCallSnapshot | null {
  if (call.status === "ended") return null;
  const participant = call.participants.find((item) => item.userId === userId);
  if (!participant) return null;
  const participants = call.participants.map((item) => item.userId === userId ? { ...item, state } : item);
  return {
    ...call,
    participants,
    screenShareUserId: state === "connected" ? call.screenShareUserId :
      call.screenShareUserId === userId ? null : call.screenShareUserId,
    version: call.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function createMockCall(input: CreateMockCallInput): MockCallSnapshot {
  const createdAt = (input.now ?? new Date()).toISOString();
  const inviteeIds = [...new Set(input.inviteeIds.filter((userId) => userId !== input.callerId))];
  return {
    id: input.id,
    chatId: input.chatId,
    callType: input.callType,
    callerId: input.callerId,
    participants: [
      { userId: input.callerId, state: "connected" },
      ...inviteeIds.map((userId) => ({ userId, state: "ringing" as const })),
    ],
    screenShareUserId: null,
    status: inviteeIds.length ? "ringing" : "active",
    version: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

export function acceptMockCall(call: MockCallSnapshot, userId: string): MockCallSnapshot | null {
  const next = withUpdatedParticipant(call, userId, "connected");
  return next ? { ...next, status: "active" } : null;
}

export function declineMockCall(call: MockCallSnapshot, userId: string): MockCallSnapshot | null {
  const participant = call.participants.find((item) => item.userId === userId);
  if (!participant || participant.state !== "ringing") return null;
  const next = withUpdatedParticipant(call, userId, "declined");
  if (!next) return null;
  const hasRingingInvitee = next.participants.some((item) => item.state === "ringing");
  const hasConnectedInvitee = next.participants.some((item) => item.userId !== next.callerId && item.state === "connected");
  return !hasRingingInvitee && !hasConnectedInvitee ? { ...next, status: "ended" } : next;
}

export function inviteMockCallUsers(call: MockCallSnapshot, userIds: string[]): MockCallSnapshot | null {
  if (call.status === "ended") return null;
  const knownUserIds = new Set(call.participants.map((participant) => participant.userId));
  const newParticipants = [...new Set(userIds)]
    .filter((userId) => !knownUserIds.has(userId))
    .map((userId) => ({ userId, state: "ringing" as const }));
  if (!newParticipants.length) return call;
  const updatedAt = new Date().toISOString();
  return {
    ...call,
    participants: [...call.participants, ...newParticipants],
    status: "ringing",
    version: call.version + 1,
    updatedAt,
  };
}

export function leaveMockCall(call: MockCallSnapshot, userId: string): MockCallSnapshot | null {
  const next = withUpdatedParticipant(call, userId, "left");
  if (!next) return null;
  const connectedCount = next.participants.filter((participant) => participant.state === "connected").length;
  const hasRingingInvitee = next.participants.some((participant) => participant.state === "ringing");
  if (connectedCount === 0 || (connectedCount <= 1 && !hasRingingInvitee)) {
    return { ...next, status: "ended" };
  }
  return { ...next, status: connectedCount <= 1 ? "ringing" : "active" };
}

export function startMockCallScreenShare(
  call: MockCallSnapshot,
  userId: string,
  now = new Date(),
): MockCallSnapshot | null {
  const participant = call.participants.find((item) => item.userId === userId);
  if (call.status !== "active" || participant?.state !== "connected") return null;
  if (call.screenShareUserId && call.screenShareUserId !== userId) return null;
  if (call.screenShareUserId === userId) return call;
  return {
    ...call,
    screenShareUserId: userId,
    version: call.version + 1,
    updatedAt: now.toISOString(),
  };
}

export function stopMockCallScreenShare(
  call: MockCallSnapshot,
  userId: string,
  now = new Date(),
): MockCallSnapshot | null {
  const participant = call.participants.find((item) => item.userId === userId);
  if (call.status !== "active" || call.screenShareUserId !== userId || participant?.state !== "connected") return null;
  return {
    ...call,
    screenShareUserId: null,
    version: call.version + 1,
    updatedAt: now.toISOString(),
  };
}

export function endMockCall(call: MockCallSnapshot): MockCallSnapshot {
  return {
    ...call,
    participants: call.participants.map((participant) =>
      participant.state === "declined" ? participant : { ...participant, state: "left" },
    ),
    screenShareUserId: null,
    status: "ended",
    version: call.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function readMockCallSnapshot(): MockCallSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    return parseMockCallSnapshot(window.localStorage.getItem(MOCK_CALL_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function publishMockCallSnapshot(call: MockCallSnapshot | null): void {
  ensureChannel();
  try {
    if (call) window.localStorage.setItem(MOCK_CALL_STORAGE_KEY, JSON.stringify(call));
    else window.localStorage.removeItem(MOCK_CALL_STORAGE_KEY);
  } catch {
    // BroadcastChannel still coordinates open tabs if browser storage is full.
  }
  channel?.postMessage(call);
  notify(call);
}

export function subscribeToMockCallChanges(
  subscriber: (call: MockCallSnapshot | null) => void,
): () => void {
  ensureChannel();
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && storageListener && typeof window !== "undefined") {
      window.removeEventListener("storage", storageListener);
      storageListener = null;
    }
    if (subscribers.size === 0 && channel) {
      channel.close();
      channel = null;
    }
  };
}
