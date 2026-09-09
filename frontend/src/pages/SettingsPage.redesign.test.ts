import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/SettingsPage.tsx", "utf8");
const dashboard = readFileSync("src/pages/settings/SettingsDashboard.tsx", "utf8");
const appearanceControls = readFileSync("src/pages/settings/AppearanceControls.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

describe("SettingsPage redesign", () => {
  it("uses the tiled overview and explicit internal setting surfaces", () => {
    expect(source).toContain("<SettingsDashboard");
    expect(dashboard).toContain('className="settings-dashboard"');
    expect(dashboard).toContain('settings-tile--${item.id.toLowerCase().replaceAll(" ", "-")}');
    expect(dashboard).toContain('aria-label={strings.settings.openProfileSettings}');
    expect(dashboard).toContain('aria-label={strings.settings.openSectionAria(item.label)}');
    expect(styles).toContain(".settings-tile--statistics");
  });

  it("shows a live theme preview inside the Appearance tile", () => {
    expect(dashboard).toContain('className="settings-appearance-preview"');
    expect(source).toContain("formatAppearanceHelper");
    expect(dashboard).toContain("settings-appearance-preview-chat");
    expect(dashboard).toContain("tapToPersonalize");
  });

  it("does not offer server address changes from settings", () => {
    expect(source).not.toContain('settings-tile--server');
    expect(source).not.toContain('settings.changeServerAddress');
  });

  it("keeps appearance controls compact with working style options", () => {
    expect(source).not.toContain("Using {resolvedThemeMode}");
    expect(appearanceControls).toContain("appearance-custom-swatch");
    expect(appearanceControls).toContain("<Palette aria-hidden=\"true\" size={15}");
    expect(appearanceControls).toContain("strings.appearance.bubbleCurvatureAria");
    expect(appearanceControls).toContain("MESSAGE_FONT_OPTIONS");
    expect(appearanceControls).toContain("appearance-wallpaper-tile ${tile.thumbClass}");
    expect(styles).toContain("appearance-segment--bar");
    expect(styles).toContain("appearance-segment--fonts button:nth-child(n + 4)");
    expect(styles).toContain("appearance-wallpaper-tile.appearance-wallpaper-thumb--dots");
    expect(styles).toContain("font-family: var(--message-font-family, inherit)");
  });

  it("places Reset all to defaults button in the title row for keyboard shortcuts", () => {
    expect(source).toContain('activeSettingsItem === "Shortcuts" && (');
    expect(source).toContain("shortcuts-reset-all-btn");
    expect(source).toContain("resetAllShortcutBindings");
    expect(styles).toContain(".shortcuts-reset-all-btn");
  });
});
