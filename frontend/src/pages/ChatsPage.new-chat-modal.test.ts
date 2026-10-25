import { readCssSource } from "../test/cssSource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chatOverlays = readFileSync("src/features/chats/ChatOverlays.tsx", "utf8");
const newChatDialog = readFileSync("src/features/chats/sidebar/NewChatDialog.tsx", "utf8");
const styles = readCssSource("src/styles.css");

describe("new message dialog on web", () => {
  it("places the new-chat flow inside a dismissible desktop modal backdrop", () => {
    expect(chatOverlays).toContain('backdropClassName="new-chat-modal-backdrop"');
    expect(chatOverlays).toContain('onClose={closeNewChatScreen}');
    expect(chatOverlays).toContain("closeOnBackdrop");
  });

  it("uses a centered dialog on web and retains the full-screen mobile layout", () => {
    expect(styles).toContain(".new-chat-modal-backdrop {");
    expect(styles).toContain(".new-chat-screen {");
    expect(styles).toContain("width: min(100%, 640px);");
    expect(styles).toContain("max-width: 640px;");
    expect(styles).toContain("@media (max-width: 767px)");
  });

  it("uses an icon-only close button instead of a highlighted Cancel control", () => {
    expect(newChatDialog).toContain("<PopupCloseButton");
    expect(newChatDialog).toContain("ariaLabel={strings.chats.newChat.close}");
    expect(newChatDialog).toContain("onClick={onClose}");
    expect(newChatDialog).not.toContain(">\n          Cancel\n        </button>");
  });

  it("uses the shared pill input for new chat title inputs", () => {
    expect(newChatDialog).toContain("<PopupField");
    const popupCss = readFileSync("src/components/ui/Popup.css", "utf8");
    expect(popupCss).toContain("border-radius: 999px;");
    expect(styles).toContain(".new-chat-screen .new-chat-compose-title-field input:not([type=\"checkbox\"]):not([type=\"radio\"]):not([type=\"range\"]),");
    expect(styles).toContain("border-radius: var(--radius-panel);");
  });

  it("supports 1-person chat creation with creator listed and solo hint", () => {
    expect(newChatDialog).toContain("new-chat-contact-row selected is-creator");
    expect(newChatDialog).toContain("new-chat-solo-hint");
    expect(chatOverlays).toContain("currentUser={currentUser}");
  });

  it("defines folder drag and drop styles including locked restriction indicators", () => {
    expect(styles).toContain(".chat-folder-locked-icon");
    expect(styles).toContain(".chat-list-section.folder-drop-target");
    expect(styles).toContain(".chat-list-section.folder-drop-restricted");
    expect(styles).toContain(".chat-list-item.is-dragging");
  });
});
