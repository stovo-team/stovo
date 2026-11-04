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

  it("keeps the desktop new-chat dialog at the large width in every language", () => {
    const dialogRule = styles.match(/\.popup-dialog\.new-chat-screen \{([^}]*)\}/)?.[1] ?? "";
    expect(dialogRule).toMatch(/width:\s*640px;/);
    expect(dialogRule).toMatch(/min-width:\s*640px;/);
    expect(dialogRule).toMatch(/max-width:\s*640px;/);
    expect(dialogRule).toMatch(/padding:\s*0;/);
    expect(dialogRule).not.toMatch(/min\(100%/);
    const mobileRule = styles.match(/@media \(max-width: 767px\) \{[\s\S]*?\.popup-dialog\.new-chat-screen \{([^}]*)\}/)?.[1] ?? "";
    expect(mobileRule).toMatch(/min-width:\s*0;/);
    expect(mobileRule).toMatch(/max-width:\s*none;/);
    expect(mobileRule).toMatch(/width:\s*100%;/);
  });

  it("bounds the dialog to narrow phone and tablet viewports", () => {
    const compactRule = styles.match(/@media \(min-width: 768px\) and \(max-width: 1024px\) \{\s*\.popup-dialog\.new-chat-screen \{([^}]*)\}/)?.[1] ?? "";
    expect(compactRule).toMatch(/box-sizing:\s*border-box;/);
    expect(compactRule).toMatch(/min-width:\s*0;/);
    expect(compactRule).toMatch(/width:\s*min\(640px, calc\(100vw - 24px\)\);/);
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

  it("keeps the member list scrollable above a bottom-pinned create action", () => {
    const composeStart = newChatDialog.indexOf('className="new-chat-compose"');
    const membersStart = newChatDialog.indexOf('className="new-chat-contact-list"', composeStart);
    const createStart = newChatDialog.indexOf('<PopupButton type="submit"', composeStart);
    expect(membersStart).toBeGreaterThan(composeStart);
    expect(createStart).toBeGreaterThan(membersStart);
    expect(styles).toMatch(/\.new-chat-compose \.new-chat-contact-list\s*\{[^}]*max-height:\s*min\(44vh, 320px\);[^}]*overflow:\s*auto;/s);
    expect(styles).toMatch(/\.new-chat-compose > \.popup-button\s*\{[^}]*align-self:\s*flex-end;[^}]*margin-top:\s*auto;/s);
    expect(styles).toMatch(/\.new-chat-contact-list\s*\{[^}]*padding:\s*0 var\(--mobile-edge-inset-x, 12px\) max\(16px, env\(safe-area-inset-bottom\)\);/s);
    expect(styles).toMatch(/\.new-chat-compose \.new-chat-contact-row\s*\{[^}]*padding-inline:\s*12px;/s);
  });

  it("insets new-chat actions and gives its search field space above", () => {
    expect(styles).toMatch(/\.new-chat-actions\s*\{[^}]*padding-inline:\s*var\(--mobile-edge-inset-x, 12px\);/s);
    expect(styles).toMatch(/\.new-chat-screen > \.popup-field\s*\{[^}]*padding-top:\s*12px;/s);
  });

  it("keeps the close and back buttons visually unchanged on hover", () => {
    expect(styles).toMatch(/\.new-chat-screen \.popup-close:hover:not\(:disabled\)\s*\{[^}]*background:\s*#6b7280;/s);
    expect(styles).toMatch(/\.new-chat-screen \.new-chat-screen-back,\s*\.new-chat-screen \.new-chat-screen-back:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--color-palette-db051e710650\);[^}]*border:\s*1px solid var\(--color-palette-19c8cd6ac63b\);/s);
  });

  it("uses the shared accent for New Channel and matching circular icon sizing", () => {
    expect(styles).toMatch(/\.new-chat-action-icon--channel\s*\{[^}]*background:\s*var\(--accent-primary\);/s);
    expect(styles).toMatch(/\.chat-avatar \.entity-avatar__symbol\s*\{[^}]*height:\s*50%;[^}]*width:\s*50%;/s);
    expect(styles).toMatch(/\.entity-avatar:not\(\[data-avatar-kind="person"\]\)\s*\{[^}]*border-radius:\s*var\(--radius-circle\);/s);
  });

  it("keeps primary button hover fills unchanged while preserving non-filled hover feedback", () => {
    const popupStyles = readFileSync("src/components/ui/Popup.css", "utf8");
    const primaryHover = popupStyles.match(/\.popup-button--primary:hover:not\(:disabled\)\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(primaryHover).toMatch(/background:\s*var\(--accent-primary\);/);
    expect(primaryHover).toMatch(/border-color:\s*var\(--accent-primary\);/);
    expect(styles).toMatch(/\.compose-fab:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--color-brand-gradient, var\(--accent-primary\)\);/s);
    expect(styles).toContain("button:hover:not(:disabled):where(:not(.pinned-banner-click-area))");
    expect(styles).toContain(".new-chat-action-row:hover");
  });

  it("defines folder drag and drop styles including locked restriction indicators", () => {
    expect(styles).toContain(".chat-folder-locked-icon");
    expect(styles).toContain(".chat-list-section.folder-drop-target");
    expect(styles).toContain(".chat-list-section.folder-drop-restricted");
    expect(styles).toContain(".chat-list-item.is-dragging");
  });
});
