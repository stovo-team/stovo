import { describe, expect, it } from "vitest";
import { sanitizeUrl } from "./sanitizeUrl";

describe("sanitizeUrl", () => {
  it("allows safe https and http URLs", () => {
    expect(sanitizeUrl("https://example.com/photo.png")).toBe("https://example.com/photo.png");
    expect(sanitizeUrl("http://localhost:5174/api/files/1")).toBe("http://localhost:5174/api/files/1");
  });

  it("allows relative URLs and blob URLs", () => {
    expect(sanitizeUrl("/api/family/avatar/123")).toBe("/api/family/avatar/123");
    expect(sanitizeUrl("./assets/logo.png")).toBe("./assets/logo.png");
    expect(sanitizeUrl("blob:http://localhost:5174/abc-123")).toBe("blob:http://localhost:5174/abc-123");
  });

  it("allows safe base64 image data URLs", () => {
    const safeDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA";
    expect(sanitizeUrl(safeDataUrl)).toBe(safeDataUrl);
  });

  it("blocks javascript: and vbscript: URLs", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeUrl("JAVASCRIPT:alert(document.cookie)")).toBe("");
    expect(sanitizeUrl("javascript:/*--></title>*/<script>alert(1)</script>")).toBe("");
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBe("");
  });

  it("blocks unsafe data: URLs", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(sanitizeUrl("data:application/javascript,alert(1)")).toBe("");
  });

  it("returns fallback for null, undefined, empty, or whitespace strings", () => {
    expect(sanitizeUrl(null)).toBe("");
    expect(sanitizeUrl(undefined)).toBe("");
    expect(sanitizeUrl("")).toBe("");
    expect(sanitizeUrl("   ", "fallback")).toBe("fallback");
  });
});
