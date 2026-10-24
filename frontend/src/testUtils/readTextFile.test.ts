import { describe, expect, it } from "vitest";
import { normalizeLineEndings } from "./readTextFile";

describe("source text helper", () => {
  it("normalizes Windows CRLF line endings before source assertions", () => {
    expect(normalizeLineEndings("first line\r\nsecond line\r\n")).toBe("first line\nsecond line\n");
  });
});
