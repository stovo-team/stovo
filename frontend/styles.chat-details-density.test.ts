import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const styles = readFileSync("src/styles.css", "utf8");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return start < 0 ? "" : styles.slice(start, styles.indexOf("}", start));
};
it("fits detail tabs and members in the narrow panel with larger media tiles", () => {
  expect(rule(".chat-info-tab")).toContain("font-size: var(--font-size-caption);");
  expect(rule(".chat-info-tab")).toContain("min-height: 36px;");
  expect(rule(".chat-info-media-grid.details-media-grid")).toContain("repeat(3, minmax(0, 1fr))");
  expect(rule(".chat-info-member-row")).toContain("min-height: 44px;");
  expect(rule(".chat-info-member-row")).toContain("padding: 6px 12px;");
  expect(rule(".chat-info-member-copy")).toContain("line-height: 1.2;");
  expect(rule(".chat-info-member-copy strong")).toContain("font-size: var(--font-size-small);");
});
