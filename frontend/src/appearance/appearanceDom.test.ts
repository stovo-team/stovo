import { afterEach, describe, expect, it } from "vitest";

import { applyAppearanceToDocument } from "./appearanceDom";
import { DEFAULT_APPEARANCE } from "./AppearanceContext";

describe("applyAppearanceToDocument", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.removeAttribute("data-theme-mode");
  });

  it("restores a saved gradient and keeps its paired custom plain accent", () => {
    const gradient = "linear-gradient(135deg, #123456, #abcdef)";
    window.localStorage.setItem("familyMessenger.brandGradient", gradient);
    const appearance = { ...DEFAULT_APPEARANCE, accent: "custom" as const, customAccent: "#123456" };

    applyAppearanceToDocument(appearance, "dark", "system-ui");

    expect(document.documentElement.style.getPropertyValue("--color-brand-gradient")).toBe(gradient);
    expect(document.documentElement.dataset.brandGradient).toBe("custom");
    expect(document.documentElement.style.getPropertyValue("--accent-primary-dark")).toBe("#123456");
  });

  it("ignores malformed saved gradients and preserves a separate custom accent", () => {
    window.localStorage.setItem("familyMessenger.brandGradient", "linear-gradient(red, blue)");
    const appearance = { ...DEFAULT_APPEARANCE, accent: "custom" as const, customAccent: "#654321" };

    applyAppearanceToDocument(appearance, "light", "system-ui");

    expect(document.documentElement.style.getPropertyValue("--color-brand-gradient")).toBe("");
    expect(document.documentElement.dataset.brandGradient).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("--accent-primary-light")).toBe("#654321");
  });

  it("clears a previously applied gradient when the saved value is removed", () => {
    window.localStorage.setItem("familyMessenger.brandGradient", "linear-gradient(135deg, #123456, #abcdef)");
    applyAppearanceToDocument(DEFAULT_APPEARANCE, "light", "system-ui");
    expect(document.documentElement.style.getPropertyValue("--color-brand-gradient")).not.toBe("");

    window.localStorage.removeItem("familyMessenger.brandGradient");
    applyAppearanceToDocument(DEFAULT_APPEARANCE, "light", "system-ui");

    expect(document.documentElement.style.getPropertyValue("--color-brand-gradient")).toBe("");
    expect(document.documentElement.dataset.brandGradient).toBeUndefined();
  });
});
