import { describe, expect, it } from "vitest";
import { readTextFile } from "../../../testUtils/readTextFile";

const styles = readTextFile("src/styles.css");
const chatDetailsPanel = readTextFile("src/features/chats/details/ChatDetailsPanel.tsx");

function mediaRuleContaining(selector: string, maxWidth: number) {
  const mediaQuery = `@media (max-width: ${maxWidth}px)`;
  let mediaStart = 0;

  while ((mediaStart = styles.indexOf(mediaQuery, mediaStart)) >= 0) {
    let depth = 0;
    for (let index = styles.indexOf("{", mediaStart); index < styles.length; index += 1) {
      if (styles[index] === "{") depth += 1;
      if (styles[index] === "}") {
        depth -= 1;
        if (depth === 0) {
          const mediaRules = styles.slice(mediaStart, index + 1);
          if (mediaRules.includes(selector)) return mediaRules;
          mediaStart = index + 1;
          break;
        }
      }
    }
  }

  return "";
}

function mobileChatDetailsStyles() {
  const avatarRule = styles.lastIndexOf(".chat-info-screen .chat-info-avatar-wrap {");
  const mediaStart = styles.lastIndexOf("@media (max-width: 1200px)", avatarRule);
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
    expect(mobileStyles).toContain("right: 12px;");
    expect(mobileStyles).toContain("top: 12px;");
    expect(mobileStyles).toContain("bottom: 12px;");
    expect(mobileStyles).toContain("width: min(400px, calc(100vw - 32px));");
    expect(mobileStyles).toContain("border-radius: var(--radius-panel);");
    expect(styles).toContain(".chat-layout.details-open::before");
    expect(styles).toContain("background: var(--popup-backdrop-color);");
  });

  it("opens chat details as a popup until the layout has room for a side column", () => {
    const mobileLayout = mediaRuleContaining(".chat-layout.details-open::before", 768);
    const popupDetails = mediaRuleContaining(".chat-info-screen.chat-details-panel", 1200);
    const tabletNavigation = mediaRuleContaining(".messenger-shell.messenger-shell--chat-info > .app-nav", 768);

    expect(mobileLayout).toContain(".chat-layout.details-open");
    expect(mobileLayout).toContain("grid-template-columns: 1fr;");
    expect(popupDetails).toContain(".chat-info-screen.chat-details-panel");
    expect(popupDetails).toContain("position: fixed;");
    expect(popupDetails).toContain("width: min(400px, calc(100vw - 32px));");
    expect(tabletNavigation).toContain("display: none !important;");
    expect(styles.includes("@media (min-width: 769px) and (max-width: 1200px) {\n  .chat-layout.details-open {\n    grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);" )).toBe(true);
  });

  it("keeps the tablet details popup within the space beside the chat list", () => {
    expect(styles.lastIndexOf("@media (min-width: 769px) and (max-width: 1200px)")).toBeGreaterThan(styles.lastIndexOf("@media (max-width: 1200px)"));
    expect(styles).toMatch(/@media \(min-width: 769px\) and \(max-width: 1200px\) \{[\s\S]*?\.chat-info-screen\.chat-details-panel \{[^}]*box-sizing: border-box;[^}]*width: min\(400px, calc\(100vw - var\(--nav-rail-width\) - var\(--float-outer-gap\) - var\(--float-outer-gap\) - var\(--float-panel-gap\) - 320px - 32px\)\);/);
  });

  it("keeps tablet navigation and chat layout below the popup breakpoint", () => {
    expect(styles.includes("@media (max-width: 768px) {\n  .app-frame {\n    display: block;")).toBe(true);
  });

  it("uses a compact font size for the Add people action", () => {
    expect(styles).toMatch(/\.chat-info-member-invite \{[^}]*font: inherit;[^}]*font-size: var\(--font-size-small\);/);
    expect(chatDetailsPanel).toContain('<UserPlus aria-hidden="true" size={16} />');
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
