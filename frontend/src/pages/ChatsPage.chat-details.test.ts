import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chatDetailsPanel = readFileSync(
  resolve(process.cwd(), "src/features/chats/details/ChatDetailsPanel.tsx"),
  "utf8"
);
const messagePresentation = readFileSync(
  resolve(process.cwd(), "src/features/chats/shared/messagePresentation.ts"),
  "utf8"
);
const chatPresentation = readFileSync(
  resolve(process.cwd(), "src/features/chats/shared/chatPresentation.ts"),
  "utf8"
);
const chatOverlays = readFileSync(resolve(process.cwd(), "src/features/chats/ChatOverlays.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("chat details controls", () => {
  it("edits a chat name inline in its title row", () => {
    expect(chatDetailsPanel).toContain('className="chat-info-title-inline-editor"');
    expect(chatDetailsPanel).not.toContain('id="chat-info-name-editor"');
    expect(styles).toContain(".chat-info-title-row {");
    expect(styles).toContain("justify-content: center;");
    expect(styles).toContain(".chat-info-title-edit {");
    expect(styles).toContain("display: inline-flex;");
  });

  it("does not show archive or encryption labels in the chat details hero", () => {
    expect(chatDetailsPanel).not.toContain("Saved messages");
    expect(chatDetailsPanel).not.toContain("encryptionProtocolLabel");
  });

  it("slides detail pages and shared-content tabs in the expected direction", () => {
    expect(chatDetailsPanel).toContain('className={`chat-info-tab-panel chat-info-tab-panel--${tabDirection}`}');
    expect(chatDetailsPanel).toContain("handleDetailsTabChange(tab)");
    expect(styles).toContain("@keyframes chat-info-screen-enter");
    expect(styles).toContain("@keyframes chat-info-tab-enter-from-right");
    expect(styles).toContain("@keyframes chat-info-tab-enter-from-left");
  });

  it("opens a chat settings page from the settings button", () => {
    expect(chatDetailsPanel).toContain('aria-label="Chat settings"');
    expect(chatDetailsPanel).toContain('id="chat-settings-title"');
    expect(chatDetailsPanel).toContain("Chat settings");
    expect(chatDetailsPanel).toContain("<strong>Family storage</strong>");
    expect(chatDetailsPanel).not.toContain('className="chat-info-permissions-popup"');
    expect(styles).toContain(".chat-info-screen--settings .chat-info-topbar");
  });

  it("keeps chat wallpaper on the chat settings page", () => {
    const settingsStart = chatDetailsPanel.indexOf('id="chat-settings-title"');
    const infoStart = chatDetailsPanel.indexOf('id="chat-info-title"');
    expect(settingsStart).toBeGreaterThan(-1);
    expect(infoStart).toBeGreaterThan(settingsStart);
    expect(chatDetailsPanel.slice(settingsStart, infoStart)).toContain("Chat wallpaper");
    expect(chatDetailsPanel.slice(infoStart)).not.toContain("Chat wallpaper");
    expect(chatDetailsPanel).toContain('className="chat-info-wallpaper-upload"');
    expect(styles).toContain(".chat-info-wallpaper-upload {");
  });

  it("keeps the back, settings, and edit controls neutral until interaction", () => {
    expect(styles).toContain(".chat-info-back:hover,");
    expect(styles).toContain(".chat-info-topbar-action:hover,");
    expect(styles).toContain(".chat-info-title-edit:hover {");
  });

  it("collects links and every attachment type with its source message", () => {
    expect(messagePresentation).toContain("function extractMessageLinks");
    expect(chatPresentation).toContain("message.attachments.map((file) => ({");
    expect(chatPresentation).toContain('kind: "link"');
    expect(chatPresentation).toContain("return isImage || isVideo;");
  });

  it("lets shared attachments return to their source message", () => {
    expect(chatOverlays).toContain("onGoToMessage={fullViewImage.messageId ? onGoToFullViewImageMessage : undefined}");
    expect(chatDetailsPanel).toContain("onFocusMessage={() => onFocusMessage(item.messageId)}");
  });
});
