import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const composerSource = readFileSync("src/features/chats/composer/Composer.tsx", "utf8");
const useMessageComposerSource = readFileSync(
  "src/features/chats/composer/useMessageComposer.ts",
  "utf8"
);

describe("web composer pickers", () => {
  it("opens the attachment choice panel before selecting a file", () => {
    expect(useMessageComposerSource).toMatch(
      /function handleAttachButtonClick\(\) \{\s+closeEmojiPicker\(\);\s+setIsAttachmentSheetOpen\(true\);/s
    );
    expect(composerSource).not.toContain("{Capacitor.isNativePlatform() && (");
  });

  it("uses a light hover highlight without transform scaling", () => {
    expect(styles).toContain("@media (hover: hover) and (pointer: fine)");
    expect(styles).toContain("color-mix(in oklab, var(--text-primary) 10%, transparent)");
    expect(styles).toContain("color-mix(in oklab, var(--text-primary) 14%, transparent)");
    expect(styles).toContain(".message-composer .file-picker:focus-visible,");
    expect(styles).toContain("outline: 2px solid var(--accent-primary);");
    expect(styles).toContain("transition: background-color 120ms ease-out, color 120ms ease-out;");
  });

  it("keeps attach/emoji controls aligned to the bottom in the pill with bottom margin for file picker", () => {
    expect(styles).toContain(
      ":root[data-platform=\"web\"] .messenger-shell.has-active-chat .message-composer-row"
    );
    expect(styles).toContain("align-items: end;");
    expect(styles).toContain("margin-bottom: 4px;");
    expect(styles).toContain("min-height: 48px;");
    expect(styles).toContain(
      ":root[data-platform=\"web\"] .messenger-shell.has-active-chat .message-composer textarea"
    );
    expect(styles).toContain("min-height: 36px;");
  });

  it("uses a compact desktop attachment panel and gives the emoji panel a visual connection", () => {
    expect(styles).toContain(":root[data-platform=\"web\"] .attachment-picker-sheet {");
    expect(styles).toContain("max-width: 420px;");
    expect(styles).toContain(":root[data-platform=\"web\"] .emoji-picker::after {");
    expect(styles).toContain("border-top-color: var(--island-surface);");
  });
});
