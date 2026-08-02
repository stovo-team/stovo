import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/SettingsPage.tsx", "utf8");

describe("SettingsPage redesign", () => {
  it("uses the tiled overview and explicit internal setting surfaces", () => {
    expect(source).toContain('className="settings-dashboard"');
    expect(source).toContain('settings-tile--${item.label.toLowerCase().replaceAll(" ", "-")}');
    expect(source).toContain('aria-label="Open profile settings"');
    expect(source).toContain('aria-label={`Open ${item.label.toLowerCase()} settings`}');
  });
});
