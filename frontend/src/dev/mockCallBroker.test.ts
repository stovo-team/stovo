import { describe, expect, it } from "vitest";
import {
  acceptMockCall,
  createMockCall,
  declineMockCall,
  endMockCall,
  inviteMockCallUsers,
  leaveMockCall,
} from "./mockCallBroker";

const callInput = {
  id: "mock-call-1",
  chatId: "chat-planning-team",
  callType: "video" as const,
  callerId: "user-stovo-demo",
  inviteeIds: ["user-alex-rivera", "user-maya-chen"],
  now: new Date("2026-10-09T10:00:00.000Z"),
};

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

  it("adds newly invited users as ringing participants without duplicating existing members", () => {
    const started = createMockCall(callInput);
    const active = acceptMockCall(started, "user-alex-rivera");
    const invited = inviteMockCallUsers(active!, ["user-sam-patel", "user-maya-chen"]);
    const retried = inviteMockCallUsers(invited!, ["user-sam-patel"]);

    expect(invited?.status).toBe("ringing");
    expect(invited?.participants).toContainEqual({ userId: "user-sam-patel", state: "ringing" });
    expect(invited?.participants.filter((participant) => participant.userId === "user-sam-patel")).toHaveLength(1);
    expect(retried?.version).toBe(invited?.version);
  });

  it("keeps a group room active while more than one connected participant remains", () => {
    const started = createMockCall(callInput);
    const alexJoined = acceptMockCall(started, "user-alex-rivera");
    const mayaJoined = acceptMockCall(alexJoined!, "user-maya-chen");
    const alexLeft = leaveMockCall(mayaJoined!, "user-alex-rivera");

    expect(alexLeft?.status).toBe("active");
    expect(alexLeft?.participants.find((participant) => participant.userId === "user-alex-rivera")?.state).toBe("left");
  });

  it("returns the caller to ringing when the last connected invitee leaves but another is still ringing", () => {
    const started = createMockCall(callInput);
    const alexJoined = acceptMockCall(started, "user-alex-rivera");

    expect(leaveMockCall(alexJoined!, "user-alex-rivera")?.status).toBe("ringing");
  });

  it("ends a two-person room when either person hangs up", () => {
    const started = createMockCall({ ...callInput, inviteeIds: ["user-alex-rivera"] });
    const accepted = acceptMockCall(started, "user-alex-rivera");

    expect(leaveMockCall(accepted!, "user-alex-rivera")?.status).toBe("ended");
    expect(endMockCall(accepted!)?.status).toBe("ended");
  });
});
