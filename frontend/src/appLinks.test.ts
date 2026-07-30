import { describe, expect, it } from "vitest";

import { getAudioPlaybackAppLinkPath, getInviteAppLinkPath } from "./appLinks";

describe("getInviteAppLinkPath", () => {
  it("maps a production HTTPS invite URL to the existing invite route", () => {
    expect(getInviteAppLinkPath("https://stovo-cloud.stovo.ru/invite/invite-token")).toBe(
      "/invite/invite-token"
    );
  });

  it("preserves the API URL query used by shared invite links", () => {
    expect(
      getInviteAppLinkPath(
        "https://stovo-cloud.stovo.ru/invite/invite-token?apiUrl=https%3A%2F%2Ffamily.example"
      )
    ).toBe("/invite/invite-token?apiUrl=https%3A%2F%2Ffamily.example");
  });

  it("rejects non-invite, non-HTTPS, and foreign-host URLs", () => {
    expect(getInviteAppLinkPath("https://stovo-cloud.stovo.ru/app/chats")).toBeNull();
    expect(getInviteAppLinkPath("http://stovo-cloud.stovo.ru/invite/invite-token")).toBeNull();
    expect(getInviteAppLinkPath("https://other.example/invite/invite-token")).toBeNull();
  });
});

describe("getAudioPlaybackAppLinkPath", () => {
  it("accepts only the generic production audio return URL", () => {
    expect(getAudioPlaybackAppLinkPath("https://stovo-cloud.stovo.ru/app/audio")).toBe(
      "/app/chats?restoreAudio=1"
    );
  });

  it.each([
    "http://stovo-cloud.stovo.ru/app/audio",
    "https://other.example/app/audio",
    "https://stovo-cloud.stovo.ru/app/audio/next",
    "https://stovo-cloud.stovo.ru/app%2Faudio",
    "https://user@stovo-cloud.stovo.ru/app/audio",
    "https://stovo-cloud.stovo.ru:444/app/audio",
    "https://stovo-cloud.stovo.ru/app/audio?file=secret",
    "https://stovo-cloud.stovo.ru/app/audio#fragment",
    "not a URL"
  ])("rejects unsafe or non-exact audio app links: %s", (url) => {
    expect(getAudioPlaybackAppLinkPath(url)).toBeNull();
  });
});
