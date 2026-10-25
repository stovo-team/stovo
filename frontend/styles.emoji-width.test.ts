import { readCssSource } from "./src/test/cssSource";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const styles = readCssSource("src/styles.css");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return start < 0 ? "" : styles.slice(start, styles.indexOf("}", start));
};
it("uses a compact popup while keeping the native dock full width", () => {
  const source = readFileSync("src/features/chats/composer/ComposerEmojiPicker.tsx", "utf8");
  expect(source).toContain('width={docked ? "100%" : 300}');
});
