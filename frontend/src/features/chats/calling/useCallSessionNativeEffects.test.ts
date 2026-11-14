import { describe, expect, it } from "vitest";
import { shouldEnterCallPictureInPicture } from "./useCallSessionNativeEffects";

describe("native call PiP lifecycle", () => {
  it("does not enter PiP when Android backgrounds the WebView for screen-capture consent", () => {
    expect(shouldEnterCallPictureInPicture(false, "in-call", true)).toBe(false);
    expect(shouldEnterCallPictureInPicture(false, "connecting", true)).toBe(false);
  });

  it("still enters PiP for normal call backgrounding after consent, and never from idle", () => {
    expect(shouldEnterCallPictureInPicture(false, "in-call", false)).toBe(true);
    expect(shouldEnterCallPictureInPicture(false, "idle", false)).toBe(false);
    expect(shouldEnterCallPictureInPicture(true, "in-call", false)).toBe(false);
  });
});
