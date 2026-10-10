import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { getSafeLoginReturnPath, OwnerSetupPrompt } from "./LoginPage";

describe("OwnerSetupPrompt", () => {
  it("hides owner creation after the server has been initialized", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <OwnerSetupPrompt setupRequired={false} />
      </MemoryRouter>
    );

    expect(markup).not.toContain("Create owner account");
    expect(markup).not.toContain('href="/setup"');
  });

  it("offers owner creation when initial setup is required", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <OwnerSetupPrompt setupRequired />
      </MemoryRouter>
    );

    expect(markup).toContain("Create owner account");
    expect(markup).toContain('href="/setup"');
  });
});

describe("getSafeLoginReturnPath", () => {
  it("preserves an internal consent URL including its query and fragment after login", () => {
    expect(getSafeLoginReturnPath({
      pathname: "/s/team/intelligence/consent",
      search: "?flow=source_v2&state=opaque",
      hash: "#permissions",
    }, "/s/team/app/chats")).toBe("/s/team/intelligence/consent?flow=source_v2&state=opaque#permissions");
  });

  it.each([
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/login?returnTo=/app/settings",
    "/\\attacker.example/steal",
  ])("rejects unsafe login return target %s", (pathname) => {
    expect(getSafeLoginReturnPath({ pathname }, "/app/chats")).toBe("/app/chats");
  });
});
