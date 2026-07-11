import { describe, expect, it } from "vitest";

import { getInviteAppLinkPath } from "./appLinks";

describe("getInviteAppLinkPath", () => {
  it("maps a production HTTPS invite URL to the existing invite route", () => {
    expect(getInviteAppLinkPath("https://stovo-local.stovo.ru/invite/invite-token")).toBe(
      "/invite/invite-token"
    );
  });

  it("preserves the API URL query used by shared invite links", () => {
    expect(
      getInviteAppLinkPath(
        "https://stovo-local.stovo.ru/invite/invite-token?apiUrl=https%3A%2F%2Ffamily.example"
      )
    ).toBe("/invite/invite-token?apiUrl=https%3A%2F%2Ffamily.example");
  });

  it("rejects non-invite, non-HTTPS, and foreign-host URLs", () => {
    expect(getInviteAppLinkPath("https://stovo-local.stovo.ru/app/chats")).toBeNull();
    expect(getInviteAppLinkPath("http://stovo-local.stovo.ru/invite/invite-token")).toBeNull();
    expect(getInviteAppLinkPath("https://other.example/invite/invite-token")).toBeNull();
  });
});
