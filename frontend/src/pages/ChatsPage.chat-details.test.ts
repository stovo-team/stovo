import { readCssSource } from "../test/cssSource";
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
const wallpaperEditor = readFileSync(resolve(process.cwd(), "src/components/ChatWallpaperEditorModal.tsx"), "utf8");
const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

describe("chat details controls", () => {
  it("edits a chat name inline in its title row", () => {
    expect(chatDetailsPanel).toContain('className="chat-info-title-wrap"');
    expect(chatDetailsPanel).toContain('className="chat-info-title-inline-actions"');
    expect(styles).toContain(".chat-info-title-row {");
    expect(styles).toContain("justify-content: center;");
    expect(styles).toContain(".chat-info-title-wrap {");
    expect(styles).toContain(".chat-info-title-edit {");
    expect(styles).toContain("position: absolute;");
    expect(styles).toContain("inset-inline-start: 100%;");
    expect(styles).toContain(".chat-info-title-inline-actions {");
    expect(styles).toContain(".chat-info-title-save:hover:not(:disabled),");
    expect(styles).toContain("border-radius: var(--radius-pill);");
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
    expect(chatDetailsPanel).toContain("strings.chats.details.settings");
    expect(chatDetailsPanel).toContain('id="chat-settings-title"');
    expect(chatDetailsPanel).toContain("strings.chats.details.familyStorage");
    expect(chatDetailsPanel).not.toContain('className="chat-info-permissions-popup"');
    expect(styles).toContain(".chat-info-screen--settings .chat-info-topbar");
    expect(styles).toContain(".chat-info-screen--settings .chat-info-topbar-title {");
    expect(styles).toContain("text-align: left;");
    expect(styles).toContain(".chat-info-screen--settings .chat-info-body {");
    expect(styles).toContain("padding-top: 16px;");
  });

  it("keeps chat wallpaper on the chat settings page", () => {
    const settingsStart = chatDetailsPanel.indexOf('id="chat-settings-title"');
    const infoStart = chatDetailsPanel.indexOf('id="chat-info-title"');
    expect(settingsStart).toBeGreaterThan(-1);
    expect(infoStart).toBeGreaterThan(settingsStart);
    expect(chatDetailsPanel.slice(settingsStart, infoStart)).toContain("strings.chats.details.wallpaper");
    expect(chatDetailsPanel.slice(infoStart)).not.toContain("strings.chats.details.wallpaper");
    expect(chatDetailsPanel).toContain('className="chat-info-wallpaper-upload"');
    expect(styles).toContain(".chat-info-wallpaper-upload {");
  });

  it("keeps the title edit control visually stable on hover", () => {
    expect(styles).toContain(".chat-info-back:hover,");
    expect(styles).toContain(".chat-info-topbar-action:hover {");
    expect(styles).toContain(".chat-info-title-edit:hover {");
    expect(styles.replace(/\r\n/g, "\n")).toContain(".chat-info-title-edit:hover {\n  background: transparent;");
    expect(styles).toContain("button.chat-info-title-edit:hover:not(:disabled)");
  });

  it("collects links and every attachment type with its source message", () => {
    expect(messagePresentation).toContain("function extractMessageLinks");
    expect(chatPresentation).toContain("const attachments = Array.isArray(message.attachments)");
    expect(chatPresentation).toContain('kind: "link"');
    expect(chatPresentation).toContain("return isImage || isVideo;");
  });

  it("lets shared attachments return to their source message", () => {
    expect(chatOverlays).toContain("onGoToMessage={fullViewImage.messageId ? onGoToFullViewImageMessage : undefined}");
    expect(chatDetailsPanel).toContain("onFocusMessage={() => onFocusMessage(item.messageId)}");
  });

  it("rounds the shared media grid without rounding the individual tiles", () => {
    const outerGridRule = styles.match(/\.chat-info-media-grid\.details-media-grid\s*\{([^}]*)\}/)?.[1] ?? "";
    const innerTileRule = styles.match(/\.chat-info-media-grid\s+\.media-thumb\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(outerGridRule).toMatch(/border-radius:\s*(?!0(?:px)?\s*;)[^;]+;/);
    expect(innerTileRule).toMatch(/border-radius:\s*0\s*;/);
  });

  it("adds existing server members from eligible chat details", () => {
    expect(chatDetailsPanel).toContain('chat.type === "group" || chat.type === "channel" || chat.type === "voice"');
    expect(chatDetailsPanel).toContain('className="chat-info-member-invite"');
    expect(chatDetailsPanel).toContain("onClick={onOpenAddPeople}");
    expect(styles).toContain(".chat-info-member-invite {");
  });

  it("includes message delay setting in chat settings with cooldown counter styles", () => {
    expect(chatDetailsPanel).toContain("strings.chats.details.messageDelay");
    expect(chatDetailsPanel).toContain('name="messageDelay"');
    expect(chatDetailsPanel).toContain('value="off"');
    expect(chatDetailsPanel).toContain('value="on"');
    expect(chatDetailsPanel).toContain('className="chat-info-delay-select"');
    expect(chatDetailsPanel).toContain('className="chat-info-delay-custom-input"');
    expect(styles).toContain(".composer-delay-counter {");
    expect(styles).toContain(".chat-info-delay-controls {");
    expect(styles).toContain(".chat-info-delay-select {");
    expect(styles).toContain(".chat-info-delay-custom-input {");
  });

  it("updates the message delay only from the radio change event", () => {
    expect(chatDetailsPanel).toContain("onChange={handleDelayOff}");
    expect(chatDetailsPanel).toContain("onChange={handleDelayOn}");
    expect(chatDetailsPanel).not.toContain("onClick={handleDelayOff}");
    expect(chatDetailsPanel).not.toContain("onClick={handleDelayOn}");
    expect(chatDetailsPanel).toContain("if (!event.currentTarget.checked)");
    expect(chatDetailsPanel).toContain("const displayedMessageDelay = pendingMessageDelay ?? currentMessageDelay");
    expect(chatDetailsPanel).toContain("pendingMessageDelay: number | null");
  });

  it("styles chat wallpaper upload button as fully rounded and radio buttons as modern", () => {
    expect(styles).toContain("border-radius: var(--radius-pill);");
    expect(styles).toContain(".chat-info-permission-option input[type=\"radio\"]");
    expect(styles).toContain("border-radius: var(--radius-circle);");
    expect(styles).toContain("radial-gradient(circle at center, var(--accent-primary");
  });

  it("opens a configurable preview editor before applying a chat wallpaper", () => {
    expect(chatDetailsPanel).toContain("ChatWallpaperEditorModal");
    expect(wallpaperEditor).toContain("wallpaper-editor-preview");
    expect(wallpaperEditor).toContain('update("brightness", value)');
    expect(wallpaperEditor).toContain('update("contrast", value)');
    expect(wallpaperEditor).toContain('update("gamma", value)');
    expect(wallpaperEditor).toContain('update("hue", value)');
    expect(wallpaperEditor).toContain('update("saturation", value)');
    expect(wallpaperEditor).toContain('update("blur", value)');
    expect(wallpaperEditor).toContain("context.filter");
    expect(styles).toContain(".wallpaper-editor-preview {");
  });

  it("renders and edits chat description in chat details", () => {
    expect(chatDetailsPanel).toContain("chat-info-section--description");
    expect(chatDetailsPanel).toContain("chat-info-description-editor");
    expect(chatDetailsPanel).toContain("chat-info-description-input");
    expect(chatDetailsPanel).toContain("chat-info-add-description-btn");
    expect(chatDetailsPanel).toContain("chat-info-title-edit--description");
    expect(chatDetailsPanel).toContain("strings.chats.details.description");
    expect(chatDetailsPanel).toContain("strings.chats.details.addDescription");
    expect(chatDetailsPanel).toContain("strings.chats.details.editDescription");
    expect(chatDetailsPanel).toContain("onDescriptionChange?:");
    expect(styles).toContain(".chat-info-description-editor {");
    expect(styles).toContain(".chat-info-description-input {");
    expect(styles).toContain(".chat-info-add-description-btn {");
  });

  it("renders individual chat notification preferences and controls in chat settings", () => {
    expect(chatDetailsPanel).toContain("chat-info-section--notifications");
    expect(chatDetailsPanel).toContain("strings.chats.details.notificationsSection");
    expect(chatDetailsPanel).toContain("strings.chats.details.notificationsMuteLabel");
    expect(chatDetailsPanel).toContain("strings.chats.details.notificationsQuietHours");
    expect(chatDetailsPanel).toContain("strings.chats.details.notificationsScope");
    expect(chatDetailsPanel).toContain("strings.chats.details.notificationsAlwaysMentions");

    // Mute controls
    expect(chatDetailsPanel).toContain("chat-info-mute-menu-trigger");
    expect(chatDetailsPanel).toContain('aria-haspopup="menu"');
    expect(chatDetailsPanel).toContain("chat-info-unmute-btn");

    // Quiet hours
    expect(chatDetailsPanel).toContain("chat-info-quiet-hours-inputs");
    expect(chatDetailsPanel).toContain("PopupField");

    // Notification scope & sender picker
    expect(chatDetailsPanel).toContain('name="chatNotificationScope"');
    expect(chatDetailsPanel).toContain('value="all"');
    expect(chatDetailsPanel).toContain('value="mentions_only"');
    expect(chatDetailsPanel).toContain('value="specific_senders"');
    expect(chatDetailsPanel).toContain("chat-info-senders-picker");
    expect(chatDetailsPanel).toContain("chat-info-senders-search");
    expect(chatDetailsPanel).toContain("chat-info-sender-item");

    // CSS styling
    expect(styles).toContain(".chat-info-section--notifications {");
    expect(styles).toContain(".chat-info-mute-menu-trigger {");
    expect(styles).toContain(".chat-info-mute-menu-options {");
    expect(styles).toContain(".chat-info-unmute-btn {");
    expect(styles).toContain(".chat-info-quiet-hours-inputs {");
    expect(styles).toContain(".chat-info-senders-picker {");
    expect(styles).toContain(".chat-info-sender-item {");
  });
});
