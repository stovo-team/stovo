import { describe, expect, it } from "vitest";

import { formatMessageDelay } from "./Composer";

describe("formatMessageDelay", () => {
  it("formats the remaining delay as minutes and seconds", () => {
    expect(formatMessageDelay(5)).toBe("00:05");
    expect(formatMessageDelay(65)).toBe("01:05");
  });

  it("does not produce a negative countdown", () => {
    expect(formatMessageDelay(-1)).toBe("00:00");
  });
});
