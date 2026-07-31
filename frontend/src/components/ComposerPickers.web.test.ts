import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const chatsPage = readFileSync("src/pages/ChatsPage.tsx", "utf8");

describe("web composer pickers", () => {
  it("opens the attachment choice panel before selecting a file", () => {
    expect(chatsPage).toMatch(
      /function handleAttachButtonClick\(\) \{\s+closeEmojiPicker\(\);\s+setIsAttachmentSheetOpen\(true\);/s
    );
    expect(chatsPage).not.toContain("{Capacitor.isNativePlatform() && (");
  });

  it("uses distinct interaction states for the web composer triggers", () => {
    expect(styles).toContain(":root[data-platform=\"web\"] .message-composer .file-picker,");
    expect(styles).toContain("background: var(--background-tertiary);");
    expect(styles).toContain("outline: 2px solid var(--accent-primary);");
    expect(styles).toContain("transform: scale(0.94);");
  });

  it("uses a compact desktop attachment panel and gives the emoji panel a visual connection", () => {
    expect(styles).toContain(":root[data-platform=\"web\"] .attachment-picker-sheet {");
    expect(styles).toContain("max-width: 420px;");
    expect(styles).toContain(":root[data-platform=\"web\"] .emoji-picker::after {");
    expect(styles).toContain("border-top-color: var(--island-surface);");
  });
});
