import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const composer = readFileSync("src/features/chats/composer/Composer.tsx", "utf8");
const composerEmojiPicker = readFileSync(
  "src/features/chats/composer/ComposerEmojiPicker.tsx",
  "utf8"
);
const pendingAttachmentsStrip = readFileSync(
  "src/features/chats/composer/PendingAttachmentsStrip.tsx",
  "utf8"
);
const chatHeader = readFileSync("src/features/chats/conversation/ChatHeader.tsx", "utf8");
const useMessageComposerSource = readFileSync(
  "src/features/chats/composer/useMessageComposer.ts",
  "utf8"
);
const useChatsPageControllerSource = readFileSync(
  "src/features/chats/useChatsPageController.ts",
  "utf8"
);
const useChatSurfaceDismissalSource = readFileSync(
  "src/features/chats/useChatSurfaceDismissal.ts",
  "utf8"
);
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
    expect(composerIconControlRule()).toContain("border-radius: 50%;");
    expect(composerIconControlRule(":hover")).toContain("background: color-mix(");
    expect(composerIconControlRule(":focus-visible")).toContain("background: color-mix(");
    expect(composerIconControlRule(":focus-visible")).toContain("box-shadow: none;");
    expect(composerIconControlRule(":focus-visible")).toContain("outline: 2px solid var(--accent-primary);");
    expect(composerIconControlRule(":active")).toContain("background: color-mix(");
    expect(rule('.message-composer .emoji-picker-button[aria-expanded="true"]')).toContain(
      "background: color-mix("
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
    expect(rule(".emoji-picker .epr-category-nav")).toContain("padding: 6px 8px;");
    expect(rule(".emoji-picker .epr-cat-btn:focus::before")).toContain("display: none;");
  });

  it("uses the picker's own dark sprite theme", () => {
    expect(composerEmojiPicker).toContain('theme={theme === "light" ? Theme.LIGHT : Theme.DARK}');
    expect(composerEmojiPicker).toContain("categoryIcons={EMOJI_CATEGORY_ICONS}");
    expect(styles).not.toContain(':root[data-theme-mode="dark"] .emoji-picker .epr-cat-btn');
  });

  it("docks the picker under the composer on native platforms", () => {
    expect(useChatsPageControllerSource).toContain("const isDockedEmojiPicker = Capacitor.isNativePlatform();");
    expect(useMessageComposerSource).toContain("const emojiPickerDockRef = useRef<HTMLDivElement | null>(null);");
    expect(useChatSurfaceDismissalSource).toContain("!emojiPickerDockRef.current?.contains(event.target as Node)");
    expect(rule(".messenger-shell.has-active-chat .message-composer--emoji-docked .emoji-picker-dock")).toContain(
      "margin-inline: calc(-1 * (var(--mobile-edge-inset-x) + 8px));"
    );
  });
});

describe("active chat message spacing", () => {
  it("keeps pending attachments inside the floating composer", () => {
    expect(composer).toContain("<PendingAttachmentsStrip");
    expect(pendingAttachmentsStrip).toContain('className="composer-attachments-strip"');
    expect(pendingAttachmentsStrip).toContain("PendingAttachmentCard");
  });

  it("does not restore an opaque surface behind the active-chat composer", () => {
    expect(rule(".messenger-shell.has-active-chat .message-composer")).not.toContain(
      "background: var(--island-surface);"
    );
  });

  it("uses a transparent background without top shadow behind the composer", () => {
    expect(rule(".messenger-shell.has-active-chat .message-composer")).toContain(
      "background: transparent;"
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
      "background: transparent;"
    );
    expect(rule(".messenger-shell.chat-list-view .chat-list")).toContain(
      "mask-image: linear-gradient(to bottom, transparent 0%, #000 12px);"
    );
    expect(mobileChatRule(".app-frame > .app-nav")).toContain(
      "background: transparent;"
    );
    expect(rule(".messenger-shell.chat-list-view .chat-list-filters .filter-chip")).toContain(
      "background: var(--mobile-glass-surface);"
    );
  });
});

describe("native conversation viewport and presence", () => {
  it("keeps grouped archive titles on one line", () => {
    const archiveTitleRow = lastRule(".chat-title-group--archive-group .chat-title-row");

    expect(archiveTitleRow).toContain("display: flex;");
    expect(archiveTitleRow).toContain("white-space: nowrap;");
  });

  it("uses the standard tab alignment for both archive views", () => {
    expect(lastRule(".quick-access-panel-tabs")).toContain("margin-left: 28px;");
  });

  it("keeps quick-access tabs clear of the floating panel header", () => {
    expect(rule(".quick-access-panel-tabs")).toContain("margin-top: 52px;");
  });

  it("locks the active Android conversation to the viewport and keeps the message list as its only scroller", () => {
    expect(styles).toContain(':root[data-platform="native"] .messenger-shell.has-active-chat');
    expect(styles).toContain("height: 100dvh;");
    expect(styles).toContain("overflow: hidden;");
    expect(
      lastRule(':root[data-platform="native"] .messenger-shell.has-active-chat .messages-panel')
    ).toContain("overflow-y: auto;");
  });

  it("ends the native message scroller above an open docked emoji picker", () => {
    expect(
      lastRule(':root[data-platform="native"] .messenger-shell.has-active-chat .messages-panel--emoji-docked')
    ).toContain("margin-bottom: calc(min(320px, 42vh) + 56px + max(8px, env(safe-area-inset-bottom)));");
  });

  it("uses a status-bar-safe black header gradient and shows typing next to the chat name", () => {
    expect(
      lastRule(':root[data-platform="native"] .messenger-shell.has-active-chat .chat-detail-header--floating::before')
    ).toContain("linear-gradient(to bottom, #000 0%, rgba(0, 0, 0, 0) 100%)");
    expect(chatHeader).toContain('className="chat-title-row"');
    expect(chatHeader).toContain('className="chat-presence"');
    expect(chatHeader.indexOf('className="typing-dots"')).toBeGreaterThan(
      chatHeader.indexOf('className="chat-title-row"')
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
    expect(styles).toContain(".message-bubble.has-photo-attachments:has(.message-video-attachment),");
    expect(rule(".message-bubble:has(.message-video-attachment):not(:has(.message-photo-attachment))")).toContain(
      "width: min(560px, 86%);"
    );
  });

  it("narrows portrait-only video bubbles relative to landscape", () => {
    expect(
      rule(
        ".message-bubble:has(.message-video-attachment):not(:has(.message-photo-attachment)):not(:has(.message-media-album)):has(.video-player.is-portrait)"
      )
    ).toContain("width: min(400px, 68%);");
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
    expect(desktopRule(".chat-list")).toContain("margin-top: 4px;");
    expect(desktopRule(".chat-list-filters")).toContain("overflow-x: auto;");
  });

  it("uses the floating composer and leaves room below the final message", () => {
    expect(desktopRule(".messenger-shell.has-active-chat .message-composer")).toContain(
      "background: transparent;"
    );
    expect(desktopRule(".messenger-shell.has-active-chat .messages-panel")).toContain("padding-bottom: 18px;");
  });

  it("keeps landscape video messages large and isolates audio-player interactions", () => {
    expect(lastRule(".video-player.is-session-active.is-compact.is-landscape")).toContain(
      "min-height: 240px;"
    );
    expect(audioPlayer).toContain("onContextMenu={stopInteraction}");
  });

  it("removes the desktop active-nav border while retaining a subtle selection", () => {
    expect(lastRule(".app-frame > .app-nav.app-nav--active-variant-a a.active")).toContain("border: 0;");
    expect(lastRule(".app-frame > .app-nav.app-nav--active-variant-a a.active")).toContain("opacity: 1;");
  });

  it("pins Variant A navigation without letting page content enter its rail", () => {
    expect(styles).toContain(".app-frame > :not(.app-nav) {");
    expect(styles).toContain("grid-column: 2;");
    expect(styles).toContain(".app-frame > .app-nav.app-nav--active-variant-a {");
  });

  it("shows a circular hover target behind inactive sidebar navigation icons", () => {
    expect(styles).toContain(".app-frame > .app-nav a:not(.active):hover {");
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

  it("keeps outgoing emoji-only messages flush with the right edge", () => {
    expect(
      rule(
        ".message-bubble.mine:is(.emoji-only-xl, .emoji-only-lg, .emoji-only-md)"
      )
    ).toContain("justify-self: end;");
    expect(
      rule(
        ".message-bubble.mine:is(.emoji-only-xl, .emoji-only-lg, .emoji-only-md)"
      )
    ).toContain("margin-inline-start: auto;");
    expect(
      rule(
        ".message-bubble.mine:is(.emoji-only-xl, .emoji-only-lg, .emoji-only-md)"
      )
    ).toContain("margin-inline-end: calc(-1 * var(--message-list-inline-end));");
  });
});

describe("emoji picker backgrounds", () => {
  it("uses a solid black surface throughout the picker", () => {
    expect(rule(".emoji-picker")).toContain("background: #000;");
    expect(rule(".emoji-picker .epr-category-nav")).toContain("background: #000;");
    expect(rule(".emoji-picker .epr-emoji-category-label")).toContain("background: #000;");
  });
});
