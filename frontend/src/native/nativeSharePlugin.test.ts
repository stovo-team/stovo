import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shareContent } from "./nativeSharePlugin";

describe("shareContent", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true
    });
  });

  it("calls navigator.share when available on web", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: {
        share: mockShare
      },
      writable: true,
      configurable: true
    });

    const result = await shareContent({
      title: "Join Family",
      text: "Join Stovo",
      url: "https://example.com/invite/123"
    });

    expect(result.shared).toBe(true);
    expect(mockShare).toHaveBeenCalledWith({
      title: "Join Family",
      text: "Join Stovo",
      url: "https://example.com/invite/123"
    });
  });

  it("handles user cancellation (AbortError) without indicating fallback to copy", async () => {
    const abortError = new Error("Share was cancelled by user");
    abortError.name = "AbortError";
    const mockShare = vi.fn().mockRejectedValue(abortError);

    Object.defineProperty(globalThis, "navigator", {
      value: {
        share: mockShare
      },
      writable: true,
      configurable: true
    });

    const result = await shareContent({
      title: "Join Family",
      url: "https://example.com/invite/123"
    });

    expect(result.shared).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.fallbackToCopy).toBeFalsy();
  });

  it("returns fallbackToCopy when navigator.share is unavailable", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      writable: true,
      configurable: true
    });

    const result = await shareContent({
      title: "Join Family",
      url: "https://example.com/invite/123"
    });

    expect(result.shared).toBe(false);
    expect(result.fallbackToCopy).toBe(true);
  });

  it("does not pass url separately if text already contains the url", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: {
        share: mockShare
      },
      writable: true,
      configurable: true
    });

    const result = await shareContent({
      title: "Join Family",
      text: "Join Stovo!\nhttps://example.com/invite/123",
      url: "https://example.com/invite/123"
    });

    expect(result.shared).toBe(true);
    expect(mockShare).toHaveBeenCalledWith({
      title: "Join Family",
      text: "Join Stovo!\nhttps://example.com/invite/123"
    });
  });
});
