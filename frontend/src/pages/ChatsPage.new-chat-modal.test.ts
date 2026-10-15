import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chatOverlays = readFileSync("src/features/chats/ChatOverlays.tsx", "utf8");
const newChatDialog = readFileSync("src/features/chats/sidebar/NewChatDialog.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

describe("new message dialog on web", () => {
  it("places the new-chat flow inside a dismissible desktop modal backdrop", () => {
    expect(chatOverlays).toContain('className="new-chat-modal-backdrop"');
    expect(chatOverlays).toContain('onMouseDown={closeNewChatScreen}');
  });

  it("uses a centered dialog on web and retains the full-screen mobile layout", () => {
    expect(styles).toContain(".new-chat-modal-backdrop {");
    expect(styles).toContain(".new-chat-screen {");
    expect(styles).toContain("width: min(100%, 460px);");
    expect(styles).toContain("@media (max-width: 767px)");
  });

  it("uses an icon-only close button instead of a highlighted Cancel control", () => {
    expect(newChatDialog).toContain('className="new-chat-screen-close"');
    expect(newChatDialog).toContain('aria-label="Close new message"');
    expect(newChatDialog).toContain("onClick={onClose}");
    expect(newChatDialog).not.toContain(">\n          Cancel\n        </button>");
  });

  it("rounds any new chat name input box to 22px matching the normal chat list item", () => {
    expect(styles).toContain(".new-chat-screen .new-chat-compose-title-field input:not([type=\"checkbox\"]):not([type=\"radio\"]):not([type=\"range\"]),");
    expect(styles).toContain("border-radius: 22px;");
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
