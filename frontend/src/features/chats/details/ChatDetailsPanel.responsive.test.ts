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
    expect(mobileStyles).toContain("height: 88px;");
    expect(mobileStyles).toContain("width: 88px;");
    expect(mobileStyles).toContain(".chat-info-hero h3");
    expect(mobileStyles).toContain("font-size: 1.125rem;");
    expect(mobileStyles).toContain(".chat-info-add-description-btn");
    expect(mobileStyles).toContain("padding: 9px 14px;");
    expect(mobileStyles).toContain(".chat-info-action");
    expect(mobileStyles).toContain("min-height: 52px;");
    expect(mobileStyles).toContain("padding: 8px 4px;");
  });
});
