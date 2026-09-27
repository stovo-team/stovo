import { describe, expect, it } from "vitest";
import { updateMutedParticipantIds } from "./guestParticipantMuteState";

describe("guest participant mute state", () => {
  it("adds a muted participant once and preserves other participants", () => {
    expect(updateMutedParticipantIds(["guest-a"], "guest-b", true)).toEqual(["guest-a", "guest-b"]);
    expect(updateMutedParticipantIds(["guest-a", "guest-b"], "guest-b", true)).toEqual(["guest-a", "guest-b"]);
  });

  it("removes only the participant whose microphone was unmuted", () => {
    expect(updateMutedParticipantIds(["guest-a", "guest-b"], "guest-a", false)).toEqual(["guest-b"]);
    expect(updateMutedParticipantIds(["guest-b"], "missing", false)).toEqual(["guest-b"]);
  });
});
