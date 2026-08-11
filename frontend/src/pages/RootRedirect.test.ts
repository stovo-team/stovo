import { describe, expect, it } from "vitest";

import { getUnconfiguredRootPath } from "./RootRedirect";

describe("getUnconfiguredRootPath", () => {
  it("opens the member server setup flow for a fresh native install", () => {
    expect(getUnconfiguredRootPath(true)).toBe("/server-setup");
  });

  it("keeps the master console as the browser root", () => {
    expect(getUnconfiguredRootPath(false)).toBe("/multi-admin");
  });
});
