import { describe, expect, it } from "vitest";

import { getNotificationAppLink } from "./appLinks";

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
