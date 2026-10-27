import { describe, expect, it } from "vitest";

import {
  AVATAR_COLOR_IDS,
  AVATAR_SYMBOL_IDS,
  colorForAvatarId,
  defaultAvatarSymbol,
  isKnownAvatarColorId,
  isKnownAvatarSymbolId
} from "./entityAvatar";

describe("entity avatar defaults", () => {
  it("maps each entity kind to its approved symbol", () => {
    expect(defaultAvatarSymbol("person")).toBe("initials");
    expect(defaultAvatarSymbol("family")).toBe("users");
    expect(defaultAvatarSymbol("group")).toBe("users");
    expect(defaultAvatarSymbol("archive")).toBe("archive");
    expect(defaultAvatarSymbol("voice")).toBe("audio-lines");
    expect(defaultAvatarSymbol("channel")).toBe("megaphone");
    expect(defaultAvatarSymbol("folder")).toBe("folder");
  });

  it("returns the same approved color for an entity ID", () => {
    expect(AVATAR_COLOR_IDS).toContain(colorForAvatarId("chat-123"));
    expect(colorForAvatarId("chat-123")).toBe(colorForAvatarId("chat-123"));
    expect(colorForAvatarId("chat-123")).not.toBe(colorForAvatarId("chat-456"));
  });

  it("accepts only registered symbol and color IDs", () => {
    expect(isKnownAvatarSymbolId(AVATAR_SYMBOL_IDS[0])).toBe(true);
    expect(isKnownAvatarColorId(AVATAR_COLOR_IDS[0])).toBe(true);
    expect(isKnownAvatarSymbolId("<svg onload=alert(1)>" as never)).toBe(false);
    expect(isKnownAvatarColorId("url(javascript:alert(1))" as never)).toBe(false);
  });
});
