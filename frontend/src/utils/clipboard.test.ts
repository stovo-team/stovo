import { describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
  it("returns false for empty text", () => {
    expect(copyToClipboard("")).toBe(false);
  });

  it("uses navigator.clipboard when available", () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true
    });

    const result = copyToClipboard("Hello world");
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("Hello world");

    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true
    });
  });
});
