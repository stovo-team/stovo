import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const chatsPage = readFileSync("src/pages/ChatsPage.tsx", "utf8");
const audioPlayer = readFileSync("src/components/AudioPlayer.tsx", "utf8");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return styles.slice(start, styles.indexOf("}", start));
};
const lastRule = (selector: string) => {
  const start = styles.lastIndexOf(`${selector} {`);
  return styles.slice(start, styles.indexOf("}", start));
};
const desktopRule = (selector: string) => {
  const desktopMedia = styles.indexOf(
    "@media (min-width: 961px) {",
    styles.indexOf("/* Desktop conversation chrome")
  );
  const start = styles.indexOf(`${selector} {`, desktopMedia);
  return styles.slice(start, styles.indexOf("}", start));
};
const mobileChatRule = (selector: string) => {
  const firstMobileMedia = styles.indexOf("@media (max-width: 960px) {");
  const chatMobileMedia = styles.indexOf("@media (max-width: 960px) {", firstMobileMedia + 1);
  const start = styles.indexOf(`${selector} {`, chatMobileMedia);
  return styles.slice(start, styles.indexOf("}", start));
};
const composerIconControlRule = (state = "") => {
  const start = styles.indexOf(`.message-composer .file-picker${state},`);
  return styles.slice(start, styles.indexOf("}", start));
};

describe("docked emoji picker styles", () => {
  it("keeps composer attachment and emoji controls as plain icons", () => {
    expect(composerIconControlRule()).toContain("background: transparent;");
    expect(composerIconControlRule()).toContain("border-radius: 0;");
    expect(composerIconControlRule(":hover")).toContain("background: transparent;");
    expect(composerIconControlRule(":focus-visible")).toContain("background: transparent;");
    expect(composerIconControlRule(":focus-visible")).toContain("box-shadow: none;");
    expect(composerIconControlRule(":focus-visible")).toContain("outline: none;");
    expect(composerIconControlRule(":active")).toContain("background: transparent;");
    expect(rule('.message-composer .emoji-picker-button[aria-expanded="true"]')).toContain(
      "background: transparent;"
    );
  });

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
  it("keeps pending attachments inside the floating composer", () => {
    const attachmentStrip = chatsPage.indexOf('className="composer-attachments-strip"');
    const composerForm = chatsPage.lastIndexOf('<form', attachmentStrip);

    expect(attachmentStrip).toBeGreaterThan(composerForm);
    expect(chatsPage.slice(composerForm, attachmentStrip)).toContain('className={`message-composer');
  });

  it("does not restore an opaque surface behind the active-chat composer", () => {
    expect(rule(".messenger-shell.has-active-chat .message-composer")).not.toContain(
      "background: var(--island-surface);"
    );
  });

  it("uses a theme-aware bottom-to-top fade behind the composer", () => {
    expect(rule(".messenger-shell.has-active-chat .message-composer")).toContain(
      "background: linear-gradient(to top, var(--chat-layout-background), transparent);"
    );
  });

  it("uses one narrower shared horizontal inset for the message list and composer", () => {
    expect(rule(".messenger-shell.has-active-chat .messages-panel")).toContain(
      "padding-inline: var(--active-chat-message-inset-x);"
    );
    expect(rule(".messenger-shell.has-active-chat .message-composer")).toContain(
      "margin-inline: var(--active-chat-message-inset-x);"
    );
  });

  it("reserves matching scrollbar gutters so message content is visually centered", () => {
    expect(rule(".messenger-shell.has-active-chat .messages-panel")).toContain(
      "scrollbar-gutter: stable both-edges;"
    );
  });

  it("does not apply Markdown list indentation to the chat message list", () => {
    expect(styles).not.toMatch(/(?:^|\n)\.message-list \{\r?\n  margin: 0.35em 0;/);
    expect(styles).toContain(".message-body .message-list {");
  });
});

describe("message context menu glass treatment", () => {
  it("uses a rounded, 90 percent opaque liquid-glass surface", () => {
    expect(rule(".message-context-menu")).toContain("background: rgba(15, 23, 42, 0.9);");
    expect(rule(".message-context-menu")).toContain("backdrop-filter: blur(24px) saturate(1.35);");
    expect(rule(".message-context-menu")).toContain("border-radius: 24px;");
    expect(rule(".message-context-menu button")).toContain("border-radius: 14px;");
    expect(rule(".message-context-reactions button")).toContain("border-radius: 50%;");
  });
});

describe("mobile chat chrome", () => {
  it("uses canvas fades and glass surfaces without moving the chat list start", () => {
    expect(rule(".messenger-shell.chat-list-view .chat-sidebar-header")).toContain(
      "background: linear-gradient(to bottom, var(--chat-layout-background), transparent);"
    );
    expect(rule(".messenger-shell.chat-list-view .chat-list")).toContain(
      "mask-image: linear-gradient(to bottom, transparent, #000 20px);"
    );
    expect(mobileChatRule(".app-frame > .app-nav")).toContain(
      "background: var(--mobile-glass-surface-strong);"
    );
    expect(rule(".messenger-shell.chat-list-view .chat-list-filters .filter-chip")).toContain(
      "background: var(--mobile-glass-surface);"
    );
  });
});

describe("message media sizing", () => {
  it("gives videos and photo albums the wider media bubble width", () => {
    expect(rule(".message-bubble.has-photo-attachments")).toContain(
      "max-width: min(560px, 86%);"
    );
    expect(rule(".message-bubble.has-photo-attachments:has(.message-media-album)")).toContain(
      "max-width: min(560px, 86%);"
    );
    expect(rule(".message-bubble.has-photo-attachments:has(.message-video-attachment),\n.message-bubble:has(.message-video-attachment):not(:has(.message-photo-attachment))")).toContain(
      "width: min(560px, 86%);"
    );
  });
});

describe("expanded video player", () => {
  it("uses the full viewport for the expanded video stage", () => {
    expect(rule(".video-player-lightbox")).toContain("padding: 0;");
    expect(rule(".video-player-expanded")).toContain("height: 100dvh;");
    expect(rule(".video-player-expanded")).toContain("width: 100vw;");
    expect(rule(".video-player-expanded")).toContain("max-height: none;");
    expect(rule(".video-player-expanded")).toContain("max-width: none;");
    expect(rule(".video-player-expanded")).toContain("aspect-ratio: auto;");
  });
});

describe("desktop chat refinements", () => {
  it("keeps the sidebar chrome above a full-height scrollable chat list", () => {
    expect(desktopRule(".chat-sidebar-header")).toContain("margin: 0;");
    expect(desktopRule(".chat-sidebar-header")).toContain("position: sticky;");
    expect(desktopRule(".chat-list")).toContain("margin-top: var(--chat-list-chrome-gap, 16px);");
    expect(desktopRule(".chat-list-filters")).toContain("overflow-x: auto;");
  });

  it("uses a rounded grey composer and leaves room below the final message", () => {
    expect(desktopRule(".messenger-shell.has-active-chat .message-composer")).toContain(
      "background: var(--background-secondary);"
    );
    expect(desktopRule(".messenger-shell.has-active-chat .messages-panel")).toContain("padding-bottom: 18px;");
  });

  it("keeps landscape video messages large and permits media right-clicks to reach the message menu", () => {
    expect(lastRule(".video-player.is-session-active.is-compact.is-landscape")).toContain(
      "min-height: 240px;"
    );
    expect(audioPlayer).not.toContain("onContextMenu={stopInteraction}");
  });

  it("removes the desktop active-nav border while retaining a subtle selection", () => {
    expect(lastRule(".app-frame > .app-nav.app-nav--active-variant-a a.active")).toContain("border: 0;");
    expect(lastRule(".app-frame > .app-nav.app-nav--active-variant-a a.active")).toContain("opacity: 0.72;");
  });

  it("shows a circular hover target behind inactive sidebar navigation icons", () => {
    expect(desktopRule(".app-frame > .app-nav a:not(.active):hover::before")).toContain("border-radius: 50%;");
    expect(desktopRule(".app-frame > .app-nav a:not(.active):hover::before")).toContain("height: 44px;");
    expect(desktopRule(".app-frame > .app-nav a:not(.active):hover::before")).toContain("width: 44px;");
  });

  it("applies the narrow-layout refinements to browser and native rendering", () => {
    expect(styles).toContain(':root[data-platform="web"] .messenger-shell.chat-list-view .chat-sidebar-header');
    expect(styles).toContain(':root[data-platform="web"] .messenger-shell.has-active-chat .message-composer');
    expect(styles).toContain(':root[data-platform="web"] .app-frame > .app-nav.app-nav--active-variant-a');
    expect(styles).toContain(':root[data-platform="native"] .messenger-shell.chat-list-view .chat-sidebar-header');
    expect(styles).toContain(':root[data-platform="native"] .messenger-shell.has-active-chat .message-composer');
  });
});

describe("emoji-only message sizes", () => {
  it("sizes the Markdown message body for one, two, and three emoji", () => {
    expect(rule(".message-bubble.emoji-only-xl .message-body")).toContain("font-size: 3rem;");
    expect(rule(".message-bubble.emoji-only-lg .message-body")).toContain("font-size: 2rem;");
    expect(rule(".message-bubble.emoji-only-md .message-body")).toContain("font-size: 1.25rem;");
  });
});
