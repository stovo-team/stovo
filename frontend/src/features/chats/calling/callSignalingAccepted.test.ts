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
