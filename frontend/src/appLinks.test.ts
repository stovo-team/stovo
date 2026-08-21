import { describe, expect, it } from "vitest";

import { getInviteApiUrl, getInviteAppLinkPath, getNotificationAppLink } from "./appLinks";

describe("getNotificationAppLink", () => {
  it("routes a chat notification to its exact chat", () => {
    expect(getNotificationAppLink("stovo://chat/chat-a")).toEqual({
      path: "/app/chats/chat-a"
    });
  });

  it("routes a missed-call tap without starting a call", () => {
    expect(getNotificationAppLink("stovo://call/missed/chat-a")).toEqual({
      path: "/app/chats/chat-a"
    });
  });

  it("keeps callback intent separate from an ordinary chat tap", () => {
    expect(getNotificationAppLink("stovo://call/callback/chat-a")).toEqual({
      path: "/app/chats/chat-a",
      action: "callback"
    });
  });

  it.each([
    "stovo://chat/",
    "stovo://chat/chat-a/extra",
    "stovo://call/missed/",
    "stovo://call/callback/chat-a/extra",
    "stovo://evil/chat-a",
    "https://stovo-cloud.stovo.ru/app/chats/chat-a",
    "stovo://chat/chat%2Fa",
    "stovo://chat/chat-a?callback=1",
    "stovo://chat/chat-a#fragment"
  ])("rejects malformed or unrelated links: %s", (url) => {
    expect(getNotificationAppLink(url)).toBeNull();
  });
});

describe("getInviteAppLinkPath", () => {
  it("parses stovo://invite/<token>", () => {
    expect(getInviteAppLinkPath("stovo://invite/inv-12345")).toBe("/invite/inv-12345");
  });

  it("parses stovo://invite/<token>?apiUrl=...", () => {
    expect(getInviteAppLinkPath("stovo://invite/inv-12345?apiUrl=https%3A%2F%2Fexample.com")).toBe(
      "/invite/inv-12345?apiUrl=https%3A%2F%2Fexample.com"
    );
  });

  it("parses stovo:///invite/<token>", () => {
    expect(getInviteAppLinkPath("stovo:///invite/inv-12345")).toBe("/invite/inv-12345");
  });

  it("parses stovo://app/invite/<token>", () => {
    expect(getInviteAppLinkPath("stovo://app/invite/inv-12345")).toBe("/invite/inv-12345");
  });

  it("parses stovo://stovo-cloud.stovo.ru/invite/<token>", () => {
    expect(getInviteAppLinkPath("stovo://stovo-cloud.stovo.ru/invite/inv-12345")).toBe(
      "/invite/inv-12345"
    );
  });

  it("parses stovo://invite?token=<token>&apiUrl=...", () => {
    expect(getInviteAppLinkPath("stovo://invite?token=inv-12345&apiUrl=https%3A%2F%2Fexample.com")).toBe(
      "/invite/inv-12345?apiUrl=https%3A%2F%2Fexample.com"
    );
  });

  it("parses https web invite urls", () => {
    expect(getInviteAppLinkPath("https://stovo-cloud.stovo.ru/invite/inv-12345")).toBe(
      "/invite/inv-12345?apiUrl=https%3A%2F%2Fstovo-cloud.stovo.ru"
    );
    expect(getInviteAppLinkPath("https://myfamily.stovo.ru/invite/inv-12345?apiUrl=http%3A%2F%2F192.168.1.50%3A8000")).toBe(
      "/invite/inv-12345?apiUrl=http%3A%2F%2F192.168.1.50%3A8000"
    );
  });

  it("keeps the source server for direct web app links", () => {
    expect(getInviteApiUrl("https://stovo-cloud.stovo.ru/s/family-a/invite/inv-12345")).toBe(
      "https://stovo-cloud.stovo.ru/s/family-a"
    );
    expect(getInviteAppLinkPath("https://stovo-cloud.stovo.ru/s/family-a/invite/inv-12345")).toBe(
      "/invite/inv-12345?apiUrl=https%3A%2F%2Fstovo-cloud.stovo.ru%2Fs%2Ffamily-a"
    );
  });

  it("rejects non-invite links", () => {
    expect(getInviteAppLinkPath("stovo://chat/chat-a")).toBeNull();
    expect(getInviteAppLinkPath("ftp://example.com/invite/inv-123")).toBeNull();
    expect(getInviteAppLinkPath("invalid-url")).toBeNull();
  });
});
