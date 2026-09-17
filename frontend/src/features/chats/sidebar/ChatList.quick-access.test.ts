import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/features/chats/sidebar/ChatList.tsx"), "utf8");

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("ChatList quick access selection", () => {
  it("does not highlight a regular chat while Drafts & scheduled is active", () => {
    expect(source).toContain("isActive={!isDraftsAndScheduledActive && chat.id === activeChatId}");
  });

  it("ensures quick-access-switch overrides button justify-content and sets flex-start alignment", () => {
    const switchRuleIndex = styles.indexOf(".quick-access-switch {");
    expect(switchRuleIndex).toBeGreaterThan(-1);
    const switchRule = styles.slice(switchRuleIndex, styles.indexOf("}", switchRuleIndex));
    expect(switchRule).toContain("justify-content: flex-start;");
    expect(switchRule).toContain("display: inline-flex;");
    expect(switchRule).toContain("padding: 3px;");
  });

  it("ensures quick-access-setting rows allow row-level clicks", () => {
    expect(source).toContain('className="quick-access-setting" onClick={() => updateQuickAccess({ archiveEnabled: !quickAccess.archiveEnabled })}');
    expect(source).toContain('className="quick-access-setting" onClick={() => updateQuickAccess({ outboxEnabled: !quickAccess.outboxEnabled })}');
  });

  it("aligns chat section count inline with folder title instead of centering or absolute positioning", () => {
    const countRuleIndex = styles.indexOf(".chat-section-count {");
    expect(countRuleIndex).toBeGreaterThan(-1);
    const countRule = styles.slice(countRuleIndex, styles.indexOf("}", countRuleIndex));
    expect(countRule).not.toContain("position: absolute");
    expect(countRule).not.toContain("left: 50%");
    expect(countRule).toContain("white-space: nowrap");
  });
});
