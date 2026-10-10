import { afterEach, describe, expect, it } from "vitest";
import {
  acceptMockCall,
  createMockCall,
  declineMockCall,
  endMockCall,
  getMockCallScreenShareOwnerForParticipant,
  inviteMockCallUsers,
  leaveMockCall,
  MOCK_CALL_STORAGE_KEY,
  readMockCallSnapshot,
  startMockCallScreenShare,
  stopMockCallScreenShare,
  type MockCallSnapshot,
} from "./mockCallBroker";

const callInput = {
  id: "mock-call-1",
  chatId: "chat-planning-team",
  callType: "video" as const,
  callerId: "user-stovo-demo",
  inviteeIds: ["user-alex-rivera", "user-maya-chen"],
  now: new Date("2026-10-09T10:00:00.000Z"),
};

afterEach(() => {
  localStorage.removeItem(MOCK_CALL_STORAGE_KEY);
});

function activeCall() {
  const started = createMockCall({ ...callInput, inviteeIds: ["user-alex-rivera"] });
  return acceptMockCall(started, "user-alex-rivera")!;
}

describe("local mock call transitions", () => {
  it("starts with the caller connected and invitees ringing", () => {
    const call = createMockCall(callInput);

    expect(call).toMatchObject({
      id: "mock-call-1",
      chatId: "chat-planning-team",
      callType: "video",
      callerId: "user-stovo-demo",
      status: "ringing",
    });
    expect(call.participants).toEqual([
      { userId: "user-stovo-demo", state: "connected" },
      { userId: "user-alex-rivera", state: "ringing" },
      { userId: "user-maya-chen", state: "ringing" },
    ]);
  });

  it("activates the room only for an invited user who accepts", () => {
    const started = createMockCall(callInput);
    const accepted = acceptMockCall(started, "user-alex-rivera");

    expect(accepted?.status).toBe("active");
    expect(accepted?.participants.find((participant) => participant.userId === "user-alex-rivera")?.state).toBe("connected");
    expect(acceptMockCall(started, "user-outside-chat")).toBeNull();
  });

  it("ends a call when all invitees decline", () => {
    const started = createMockCall(callInput);
    const oneDeclined = declineMockCall(started, "user-alex-rivera");
    const allDeclined = declineMockCall(oneDeclined!, "user-maya-chen");

    expect(oneDeclined?.status).toBe("ringing");
    expect(allDeclined?.status).toBe("ended");
  });

  it("clears a share when the last ringing invitee declines and ends the call", () => {
    const started = createMockCall(callInput);
    const active = acceptMockCall(started, "user-alex-rivera")!;
    const sharing = startMockCallScreenShare(active, "user-stovo-demo")!;
    const callerAlone = leaveMockCall(sharing, "user-alex-rivera")!;
    const ended = declineMockCall(callerAlone, "user-maya-chen");

    expect(callerAlone.status).toBe("active");
    expect(ended).toMatchObject({ status: "ended", screenShareUserId: null });
  });

  it("adds newly invited users as ringing participants without duplicating existing members", () => {
    const started = createMockCall(callInput);
    const active = acceptMockCall(started, "user-alex-rivera");
    const invited = inviteMockCallUsers(active!, ["user-sam-patel", "user-maya-chen"]);
    const retried = inviteMockCallUsers(invited!, ["user-sam-patel"]);

    expect(invited?.status).toBe("active");
    expect(invited?.participants).toContainEqual({ userId: "user-sam-patel", state: "ringing" });
    expect(invited?.participants.filter((participant) => participant.userId === "user-sam-patel")).toHaveLength(1);
    expect(retried?.version).toBe(invited?.version);
  });

  it("keeps an active share stoppable while inviting another participant", () => {
    const sharing = startMockCallScreenShare(activeCall(), "user-stovo-demo")!;
    const invited = inviteMockCallUsers(sharing, ["user-sam-patel"])!;

    expect(invited.status).toBe("active");
    expect(invited.screenShareUserId).toBe("user-stovo-demo");
    expect(stopMockCallScreenShare(invited, "user-stovo-demo")?.screenShareUserId).toBeNull();
  });

  it("keeps a group room active while more than one connected participant remains", () => {
    const started = createMockCall(callInput);
    const alexJoined = acceptMockCall(started, "user-alex-rivera");
    const mayaJoined = acceptMockCall(alexJoined!, "user-maya-chen");
    const alexLeft = leaveMockCall(mayaJoined!, "user-alex-rivera");

    expect(alexLeft?.status).toBe("active");
    expect(alexLeft?.participants.find((participant) => participant.userId === "user-alex-rivera")?.state).toBe("left");
  });

  it("keeps an active share stoppable while another invite is still ringing", () => {
    const started = createMockCall(callInput);
    const active = acceptMockCall(started, "user-alex-rivera")!;
    const sharing = startMockCallScreenShare(active, "user-stovo-demo")!;
    const callerAlone = leaveMockCall(sharing, "user-alex-rivera")!;

    expect(callerAlone.status).toBe("active");
    expect(callerAlone.screenShareUserId).toBe("user-stovo-demo");
    expect(stopMockCallScreenShare(callerAlone, "user-stovo-demo")?.screenShareUserId).toBeNull();
  });

  it("keeps an active call active when the last connected invitee leaves but another is still ringing", () => {
    const started = createMockCall(callInput);
    const alexJoined = acceptMockCall(started, "user-alex-rivera");

    expect(leaveMockCall(alexJoined!, "user-alex-rivera")?.status).toBe("active");
  });

  it("ends a two-person room when either person hangs up", () => {
    const started = createMockCall({ ...callInput, inviteeIds: ["user-alex-rivera"] });
    const accepted = acceptMockCall(started, "user-alex-rivera");

    expect(leaveMockCall(accepted!, "user-alex-rivera")?.status).toBe("ended");
    expect(endMockCall(accepted!)?.status).toBe("ended");
  });

  it("reads legacy snapshots without a screen-share owner as not sharing", () => {
    const legacySnapshot = { ...activeCall() } as MockCallSnapshot & { screenShareUserId?: string | null };
    delete legacySnapshot.screenShareUserId;
    localStorage.setItem(MOCK_CALL_STORAGE_KEY, JSON.stringify(legacySnapshot));

    expect(readMockCallSnapshot()?.screenShareUserId).toBeNull();
  });

  it("normalizes malformed and disconnected screen-share owners to null", () => {
    const call = activeCall();
    const disconnectedOwner = {
      ...call,
      screenShareUserId: call.callerId,
      participants: call.participants.map((participant) =>
        participant.userId === call.callerId ? { ...participant, state: "left" as const } : participant,
      ),
    };

    for (const snapshot of [
      { ...call, screenShareUserId: 42 },
      { ...call, screenShareUserId: "user-outside-call" },
      disconnectedOwner,
    ]) {
      localStorage.setItem(MOCK_CALL_STORAGE_KEY, JSON.stringify(snapshot));
      expect(readMockCallSnapshot()?.screenShareUserId).toBeNull();
    }
  });

  it("normalizes ended snapshots to no screen-share owner", () => {
    const sharing = startMockCallScreenShare(activeCall(), "user-stovo-demo")!;
    localStorage.setItem(MOCK_CALL_STORAGE_KEY, JSON.stringify({ ...sharing, status: "ended" }));

    expect(readMockCallSnapshot()?.screenShareUserId).toBeNull();
  });

  it("allows one connected participant to start sharing only in an active call", () => {
    const ringing = createMockCall({ ...callInput, inviteeIds: ["user-alex-rivera"] });
    const active = activeCall();
    const now = new Date("2026-10-09T10:05:00.000Z");
    const sharing = startMockCallScreenShare(active, active.callerId, now);

    expect(startMockCallScreenShare(ringing, ringing.callerId)).toBeNull();
    expect(startMockCallScreenShare(active, "user-outside-call")).toBeNull();
    expect(sharing).toMatchObject({
      screenShareUserId: active.callerId,
      version: active.version + 1,
      updatedAt: now.toISOString(),
    });
    expect(startMockCallScreenShare(sharing!, "user-alex-rivera")).toBeNull();
  });

  it("lets only the connected owner stop their screen share", () => {
    const active = activeCall();
    const sharing = startMockCallScreenShare(active, active.callerId)!;
    const now = new Date("2026-10-09T10:06:00.000Z");

    expect(stopMockCallScreenShare(sharing, "user-alex-rivera")).toBeNull();
    expect(stopMockCallScreenShare(sharing, active.callerId, now)).toMatchObject({
      screenShareUserId: null,
      version: sharing.version + 1,
      updatedAt: now.toISOString(),
    });
  });

  it("clears screen sharing when the owner leaves or the call ends", () => {
    const active = activeCall();
    const sharing = startMockCallScreenShare(active, active.callerId)!;

    expect(leaveMockCall(sharing, active.callerId)?.screenShareUserId).toBeNull();
    expect(endMockCall(sharing).screenShareUserId).toBeNull();
  });

  it("clears screen sharing when a non-owner leaves and ends the call", () => {
    const sharing = startMockCallScreenShare(activeCall(), "user-stovo-demo")!;
    const ended = leaveMockCall(sharing, "user-alex-rivera");

    expect(ended).toMatchObject({ status: "ended", screenShareUserId: null });
  });

  it("only exposes a presenter to connected participants in the active call", () => {
    const sharing = startMockCallScreenShare(activeCall(), "user-stovo-demo")!;
    const departedViewer = {
      ...sharing,
      participants: sharing.participants.map((participant) =>
        participant.userId === "user-alex-rivera" ? { ...participant, state: "left" as const } : participant,
      ),
    };

    expect(getMockCallScreenShareOwnerForParticipant(sharing, "user-alex-rivera")).toBe("user-stovo-demo");
    expect(getMockCallScreenShareOwnerForParticipant(sharing, "user-outside-call")).toBeNull();
    expect(getMockCallScreenShareOwnerForParticipant(departedViewer, "user-alex-rivera")).toBeNull();
  });
});
