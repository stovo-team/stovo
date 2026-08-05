import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const messageBubble = readFileSync(
  resolve(process.cwd(), "src/features/chats/conversation/MessageBubble.tsx"),
  "utf8"
);
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("message swipe reply affordance", () => {
  it("renders the reply arrow with CSS rather than an SVG icon", () => {
    expect(messageBubble).toContain('className="message-swipe-affordance" aria-hidden="true" />');
    expect(messageBubble).not.toContain('<span className="message-swipe-affordance" aria-hidden="true">\n                              <Reply size={16} />');
    expect(styles).toContain('.message-swipe-affordance::after {');
    expect(styles).toContain('content: "↩";');
    expect(styles).not.toContain('.message-swipe-affordance svg {');
  });
});
