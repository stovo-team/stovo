import { describe, expect, it } from "vitest";
import { chatInitials } from "./chatPresentation";

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
