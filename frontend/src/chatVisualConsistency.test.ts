import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { avatarInitials } from "./utils/avatarInitials";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const attachmentPicker = readFileSync(resolve(process.cwd(), "src/components/AttachmentPickerSheet.tsx"), "utf8");
const settingsAvatar = readFileSync(resolve(process.cwd(), "src/pages/settings/SettingsAvatar.tsx"), "utf8");
const appearanceEditor = readFileSync(resolve(process.cwd(), "src/pages/settings/AppearanceEditor.tsx"), "utf8");
const settingsDashboard = readFileSync(resolve(process.cwd(), "src/pages/settings/SettingsDashboard.tsx"), "utf8");

describe("chat visual consistency", () => {
  it("opens desktop attachment choices above the file button and expands to its right", () => {
    expect(attachmentPicker.match(/const intendedLeft = [^;]+;/)?.[0]).toBe("const intendedLeft = triggerRect.left;");
    expect(attachmentPicker.includes("bottom: Math.max(viewportInset, window.innerHeight - triggerRect.top + gap)")).toBe(true);
  });

  it("anchors the desktop emoji picker to the emoji button's left edge", () => {
    const pickerRule = styles.match(/\.emoji-picker \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(pickerRule).toContain("left: 0;");
    expect(pickerRule).toContain("transform: none;");
  });

  it("removes trailing horizontal padding from the last emoji column", () => {
    expect(styles).toContain("--epr-horizontal-padding: 4px;");
    expect(styles).toContain(".emoji-picker .epr-emoji-category-content {\n  margin-left: 4px;\n  margin-right: 0;");
  });

  it("uses the larger chat details button radius", () => {
    const actionRule = styles.match(/\.chat-info-action \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const mobileActionRule = styles.match(/\.chat-info-screen \.chat-info-action \{([\s\S]*?)\n  \}/)?.[1] ?? "";

    expect(actionRule).toContain("border-radius: var(--radius-surface);");
    expect(mobileActionRule).toContain("border-radius: var(--radius-surface);");
  });

  it("uses the shared initials formatter for settings profile avatars", () => {
    expect(settingsAvatar.includes('import { avatarInitials } from "../../utils/avatarInitials";')).toBe(true);
    expect(settingsAvatar.includes("avatarInitials(label)")).toBe(true);
    expect(appearanceEditor.includes("avatarInitials(displayName)")).toBe(true);
    expect(settingsDashboard.includes("avatarInitials(name)")).toBe(true);
    expect(avatarInitials("ivan")).toBe("IV");
    expect(avatarInitials("Иван Иванов")).toBe("ИИ");
  });

  it("scales generated avatar initials with the avatar circle diameter", () => {
    const avatarRule = styles.match(/\.avatar \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const initialsRule = styles.match(/\.avatar-initials \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const realAvatar = readFileSync(resolve(process.cwd(), "src/features/chats/sidebar/RealAvatar.tsx"), "utf8");
    const callTile = readFileSync(resolve(process.cwd(), "src/components/CallParticipantTile.tsx"), "utf8");
    const callCircleRule = [...styles.matchAll(/\.call-grid__avatar-circle \{([\s\S]*?)\n\}/g)]
      .find(([, rule]) => rule.includes("width: 64px"))?.[1] ?? "";

    expect(avatarRule).toContain("container-type: size;");
    expect(initialsRule).toContain("font-size: var(--font-size-avatar-initials);");
    expect(realAvatar).toContain('<span className="avatar-initials">{chatInitials(label)}</span>');
    expect(callCircleRule).toContain("container-type: size;");
    expect(callTile).toContain('fontSize: "var(--font-size-avatar-initials)"');
  });
});
