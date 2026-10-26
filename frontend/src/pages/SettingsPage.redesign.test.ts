import { readCssSource } from "../test/cssSource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/SettingsPage.tsx", "utf8");
const dashboard = readFileSync("src/pages/settings/SettingsDashboard.tsx", "utf8");
const profileSettingsTab = readFileSync("src/pages/settings/ProfileSettingsTab.tsx", "utf8");
const appearanceControls = readFileSync("src/pages/settings/AppearanceControls.tsx", "utf8");
const styles = readCssSource("src/styles.css");

describe("SettingsPage redesign", () => {
  it("does not expose the space name in Profile settings", () => {
    expect(profileSettingsTab).not.toContain("profileForm.familyName");
    expect(profileSettingsTab).not.toContain("strings.settings.family}");
  });

  it("does not expose symbol or color choices for the signed-in user's profile", () => {
    expect(profileSettingsTab).not.toContain("AvatarChoicePicker");
    expect(source).not.toContain("saveProfileAvatarChoice");
  });

  it("uses the tiled overview and explicit internal setting surfaces", () => {
    expect(source).toContain("<SettingsDashboard");
    expect(dashboard).toContain('className="settings-dashboard"');
    expect(dashboard).toContain('settings-tile--${item.id.toLowerCase().replaceAll(" ", "-")}');
    expect(dashboard).toContain('aria-label={strings.settings.openProfileSettings}');
    expect(dashboard).toContain('aria-label={strings.settings.openSectionAria(item.label)}');
    expect(styles).toContain(".settings-tile--statistics");
  });

  it("insets the profile arrow slightly from the right edge of its bar", () => {
    const arrowRule = styles.match(/\.settings-profile-open\s*>\s*svg\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(arrowRule).toMatch(/position:\s*absolute/);
    expect(arrowRule).toMatch(/right:\s*22px/);
    expect(arrowRule).toMatch(/height:\s*18px/);
    expect(arrowRule).toMatch(/width:\s*18px/);
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

  it("renders auto-download dropdown with proper alignment and compact styling", () => {
    expect(appearanceControls).toContain('className="appearance-toggle-row media-download-limit"');
    expect(styles).toContain(".media-download-limit {");
    expect(styles).toContain("justify-content: space-between");
    expect(styles).not.toContain("minmax(150px, 0.9fr)");
    expect(styles).toContain(".media-download-limit select {");
    expect(styles).toContain("appearance: none;");
  });

  it("ensures quiet hours checkbox is square and not bloated by text input styles", () => {
    expect(styles).toContain('.profile-detail-form input:not([type="checkbox"]):not([type="radio"])');
    expect(styles).toContain('.profile-detail-form input[type="checkbox"]');
    expect(styles).toContain("flex: 0 0 20px;");
  });
});
