import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/SettingsPage.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

describe("SettingsPage redesign", () => {
  it("uses the tiled overview and explicit internal setting surfaces", () => {
    expect(source).toContain('className="settings-dashboard"');
    expect(source).toContain('settings-tile--${item.id.toLowerCase().replaceAll(" ", "-")}');
    expect(source).toContain('aria-label="Open profile settings"');
    expect(source).toContain('aria-label={`Open ${item.label.toLowerCase()} settings`}');
  });

  it("shows a live theme preview inside the Appearance tile", () => {
    expect(source).toContain('className="settings-appearance-preview"');
    expect(source).toContain("formatAppearanceHelper");
    expect(source).toContain("settings-appearance-preview-chat");
    expect(source).toContain("tapToPersonalize");
  });

  it("opens server setup before clearing the session", () => {
    expect(source).toContain('navigate("/server-setup", { replace: true })');
    const navigateIndex = source.indexOf('navigate("/server-setup", { replace: true })');
    const logoutIndex = source.indexOf("void logout()");
    expect(navigateIndex).toBeGreaterThan(-1);
    expect(logoutIndex).toBeGreaterThan(navigateIndex);
  });

  it("keeps appearance controls compact with working style options", () => {
    expect(source).not.toContain("Using {resolvedThemeMode}");
    expect(source).toContain("appearance-custom-swatch");
    expect(source).toContain("<Palette aria-hidden=\"true\" size={15}");
    expect(source).toContain("Message bubble curvature");
    expect(source).toContain("MESSAGE_FONT_OPTIONS");
    expect(source).toContain("appearance-wallpaper-tile ${tile.thumbClass}");
    expect(styles).toContain("appearance-segment--bar");
    expect(styles).toContain("appearance-segment--fonts button:nth-child(n + 4)");
    expect(styles).toContain("appearance-wallpaper-tile.appearance-wallpaper-thumb--dots");
    expect(styles).toContain("font-family: var(--message-font-family, inherit)");
  });
});
