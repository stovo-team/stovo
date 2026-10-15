import { afterEach, describe, expect, it, vi } from "vitest";
import { readCallUIPreferences, writeCallUIPreferences } from "./callUIPreferences";

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("call UI preferences", () => {
  it("hides call controls automatically by default and fits camera tiles", () => {
    expect(readCallUIPreferences()).toEqual({ autoHideControls: true, cameraFit: "fit" });
  });
  it("persists valid local UI preferences", () => {
    expect(writeCallUIPreferences({ autoHideControls: true, cameraFit: "cover" })).toEqual({ autoHideControls: true, cameraFit: "cover" });
    expect(readCallUIPreferences()).toEqual({ autoHideControls: true, cameraFit: "cover" });
  });
  it("ignores invalid saved data and tolerates inaccessible storage", () => {
    localStorage.setItem("stovo.call-ui-preferences", JSON.stringify({ autoHideControls: "yes", cameraFit: "stretch" }));
    expect(readCallUIPreferences()).toEqual({ autoHideControls: true, cameraFit: "fit" });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readCallUIPreferences()).toEqual({ autoHideControls: true, cameraFit: "fit" });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(writeCallUIPreferences({ autoHideControls: false })).toEqual({ autoHideControls: false, cameraFit: "fit" });
  });
});
