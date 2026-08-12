import { describe, expect, it } from "vitest";

import { getUnconfiguredRootPath, shouldOpenMasterConsole } from "./RootRedirect";

describe("getUnconfiguredRootPath", () => {
  it("opens the member server setup flow for a fresh native install", () => {
    expect(getUnconfiguredRootPath(true)).toBe("/server-setup");
  });

  it("keeps the master console as the browser root", () => {
    expect(getUnconfiguredRootPath(false)).toBe("/multi-admin");
  });

  it("keeps a browser visitor on the exact family server route", () => {
    expect(shouldOpenMasterConsole(false, "/s/5ae8bb18")).toBe(false);
  });

  it("opens the master console only from the browser root", () => {
    expect(shouldOpenMasterConsole(false, "")).toBe(true);
  });
});
