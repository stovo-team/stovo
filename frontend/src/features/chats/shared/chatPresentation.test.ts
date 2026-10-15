import { describe, expect, it } from "vitest";
import { applyMessagePreviewToChat, chatInitials } from "./chatPresentation";

describe("completed call preview", () => {
  const chat = { id: "group", activeCall: { roomId: "current-room" } } as never;
  const message = { id: "history", type: "call", content: "", createdAt: "2026-10-11T12:00:00Z", call: { roomId: "current-room", status: "completed", durationSeconds: 8 } } as never;
  it("removes the active call indicator when history for that room arrives", () => {
    expect(applyMessagePreviewToChat(chat, message).activeCall).toBeNull();
  });
  it("preserves a new call when delayed history belongs to a previous room", () => {
    expect(applyMessagePreviewToChat(chat, { ...message as object, call: { roomId: "old-room", status: "completed" } } as never).activeCall).toEqual({ roomId: "current-room" });
  });
});

describe("chatInitials", () => {
  it("extracts two initials from multi-word names", () => {
    expect(chatInitials("John Doe")).toBe("JD");
    expect(chatInitials("Alice Bob Charlie")).toBe("AB");
  });

  it("extracts first two letters from single-word names", () => {
    expect(chatInitials("ivan")).toBe("IV");
    expect(chatInitials("A")).toBe("A");
  });

  it("strips (You) and parenthetical annotations without producing '('", () => {
    expect(chatInitials("ivan (You)")).toBe("IV");
    expect(chatInitials("John Doe (admin)")).toBe("JD");
    expect(chatInitials("Alice [You]")).toBe("AL");
  });

  it("handles Cyrillic names", () => {
    expect(chatInitials("Иван Иванов")).toBe("ИИ");
    expect(chatInitials("Иван (Вы)")).toBe("ИВ");
  });
});
