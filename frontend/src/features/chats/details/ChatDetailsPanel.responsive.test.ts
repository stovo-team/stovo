import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

function mobileChatDetailsStyles() {
  const avatarRule = styles.lastIndexOf(".chat-info-screen .chat-info-avatar-wrap {");
  const mediaStart = styles.lastIndexOf("@media (max-width: 960px)", avatarRule);
  if (mediaStart < 0) return "";

  let depth = 0;
  for (let index = styles.indexOf("{", mediaStart); index < styles.length; index += 1) {
    if (styles[index] === "{") depth += 1;
    if (styles[index] === "}") {
      depth -= 1;
      if (depth === 0) return styles.slice(mediaStart, index + 1);
    }
  }

  return "";
}

describe("mobile chat details sizing", () => {
  it("uses a compact header, avatar, description control, and action tiles", () => {
    const mobileStyles = mobileChatDetailsStyles();

    expect(mobileStyles).toContain(".chat-info-avatar-wrap");
    expect(mobileStyles).toContain("height: 72px;");
    expect(mobileStyles).toContain("width: 72px;");
    expect(mobileStyles).toContain(".chat-info-hero h3");
    expect(mobileStyles).toContain("font-size: var(--font-size-body);");
    expect(mobileStyles).toContain(".chat-info-add-description-btn");
    expect(mobileStyles).toContain("padding: 9px 14px;");
    expect(mobileStyles).toContain(".chat-info-action");
    expect(mobileStyles).toContain("min-height: 44px;");
    expect(mobileStyles).toContain("padding: 6px 4px;");
    expect(mobileStyles).toContain("position: fixed;");
    expect(mobileStyles).toContain("inset: 0;");
    expect(mobileStyles).toContain("width: 100%;");
  });

  it("keeps desktop chat details in a compact grid column beside the message pane", () => {
    expect(styles).toMatch(/\.chat-layout\.details-open\s*\{\s*grid-template-columns:\s*minmax\(280px, 320px\)\s+minmax\(0, 1fr\)\s+minmax\(240px, 280px\);/);
    expect(styles).toContain(".chat-detail {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;");
    expect(styles).toContain(".chat-info-avatar-wrap {\n  display: inline-block;\n  height: 80px;");
    expect(styles).toContain(".chat-info-hero h3 {\n  font-size: var(--font-size-body);");
    expect(styles).toContain(".chat-info-action {\n  align-items: center;");
    expect(styles).toContain("min-height: 44px;");
    expect(styles).toContain(".chat-info-action-icon {\n  color: var(--text-primary);\n  height: 18px;");
  });

  it("reserves space in Details content while a minimized call is present", () => {
    expect(styles).toMatch(/\.chat-info-body\.has-minimized-call\s*\{[^}]*padding-top:\s*var\(--minimized-call-slot-height/);
  });
});
