import { describe, expect, it } from "vitest";

import { messageArchiveViewFromStoredValue, messageArchiveViewStorageKey } from "./messageArchive";

describe("message archive view preference", () => {
  it("defaults to All messages for absent and invalid stored values", () => {
    expect(messageArchiveViewFromStoredValue(null)).toBe("all");
    expect(messageArchiveViewFromStoredValue("unexpected")).toBe("all");
  });

  it("restores Grouped by chat and scopes the preference to the user", () => {
    expect(messageArchiveViewFromStoredValue("grouped")).toBe("grouped");
    expect(messageArchiveViewStorageKey("user-1")).not.toBe(messageArchiveViewStorageKey("user-2"));
  });
});
