import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chatsPage = readFileSync("src/pages/ChatsPage.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

describe("new message dialog on web", () => {
  it("places the new-chat flow inside a dismissible desktop modal backdrop", () => {
    expect(chatsPage).toContain('className="new-chat-modal-backdrop"');
    expect(chatsPage).toContain('onMouseDown={closeNewChatScreen}');
  });

  it("uses a centered dialog on web and retains the full-screen mobile layout", () => {
    expect(styles).toContain(".new-chat-modal-backdrop {");
    expect(styles).toContain(".new-chat-screen {");
    expect(styles).toContain("width: min(100%, 640px);");
    expect(styles).toContain("@media (max-width: 767px)");
  });

  it("uses an icon-only close button instead of a highlighted Cancel control", () => {
    expect(chatsPage).toContain('className="new-chat-screen-close"');
    expect(chatsPage).toContain('aria-label="Close new message"');
    expect(chatsPage).not.toContain(">\n          Cancel\n        </button>");
  });
});
