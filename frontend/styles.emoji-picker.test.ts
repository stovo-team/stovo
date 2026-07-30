import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const chatsPage = readFileSync("src/pages/ChatsPage.tsx", "utf8");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return styles.slice(start, styles.indexOf("}", start));
};

describe("docked emoji picker styles", () => {
  it("preserves category icon sprites and lets the category strip scroll", () => {
    expect(rule(".emoji-picker .epr-cat-btn")).toContain("background-color: transparent;");
    expect(rule(".emoji-picker .epr-cat-btn")).not.toContain("background: transparent;");
    expect(rule(".emoji-picker .epr-cat-btn")).toContain("min-height: var(--epr-category-navigation-button-size);");
    expect(rule(".emoji-picker .epr-cat-btn")).toContain(
      "background-position-y: calc(var(--epr-category-navigation-button-size) * 2) !important;"
    );
    expect(rule(".emoji-picker .epr-cat-btn.epr-active")).toContain("background-color:");
    expect(rule(".emoji-picker .epr-cat-btn.epr-active")).not.toContain("background:");
    expect(rule(".emoji-picker .epr-cat-btn.epr-active")).toContain(
      "background-position-y: calc(var(--epr-category-navigation-button-size) * 3) !important;"
    );
    expect(rule(".emoji-picker .epr-category-nav")).toContain("overflow-x: auto;");
    expect(rule(".emoji-picker")).not.toContain("--epr-horizontal-padding: 0px;");
    expect(rule(".emoji-picker")).not.toContain("--epr-category-padding: 0px;");
    expect(rule(".emoji-picker")).not.toContain("--epr-emoji-padding: 0px;");
    expect(rule(".emoji-picker .epr-category-nav")).toContain("padding: 10px 12px;");
    expect(rule(".emoji-picker .epr-cat-btn:focus::before")).toContain("display: none;");
  });

  it("uses the picker's own dark sprite theme", () => {
    expect(chatsPage).toContain('theme={resolvedThemeMode === "light" ? Theme.LIGHT : Theme.DARK}');
    expect(chatsPage).toContain("categoryIcons={EMOJI_CATEGORY_ICONS}");
    expect(styles).not.toContain(':root[data-theme-mode="dark"] .emoji-picker .epr-cat-btn');
  });

  it("docks the mobile web picker under the composer", () => {
    expect(chatsPage).toContain("const isDockedEmojiPicker = isMobileViewport;");
    expect(chatsPage).toContain("const emojiPickerDockRef = useRef<HTMLDivElement | null>(null);");
    expect(chatsPage).toContain("!emojiPickerDockRef.current?.contains(event.target as Node)");
    expect(rule(".messenger-shell.has-active-chat .message-composer--emoji-docked .emoji-picker-dock")).toContain(
      "margin-inline: calc(-1 * (var(--mobile-edge-inset-x) + 8px));"
    );
  });
});

describe("active chat message spacing", () => {
  it("uses one narrower shared horizontal inset for the message list and composer", () => {
    expect(rule(".messenger-shell.has-active-chat .messages-panel")).toContain(
      "padding-inline: var(--active-chat-message-inset-x);"
    );
    expect(rule(".messenger-shell.has-active-chat .message-composer")).toContain(
      "margin-inline: var(--active-chat-message-inset-x);"
    );
  });

  it("does not apply Markdown list indentation to the chat message list", () => {
    expect(styles).not.toMatch(/(?:^|\n)\.message-list \{\r?\n  margin: 0.35em 0;/);
    expect(styles).toContain(".message-body .message-list {");
  });
});

describe("emoji-only message sizes", () => {
  it("sizes the Markdown message body for one, two, and three emoji", () => {
    expect(rule(".message-bubble.emoji-only-xl .message-body")).toContain("font-size: 3rem;");
    expect(rule(".message-bubble.emoji-only-lg .message-body")).toContain("font-size: 2rem;");
    expect(rule(".message-bubble.emoji-only-md .message-body")).toContain("font-size: 1.25rem;");
  });
});
