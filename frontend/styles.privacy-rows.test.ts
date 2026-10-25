import { expect, it } from "vitest";
import { readCssSource } from "./src/test/cssSource";
const styles = readCssSource("src/styles.css");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return start < 0 ? "" : styles.slice(start, styles.indexOf("}", start));
};
it("keeps privacy rows compact while allowing wrapped help text to grow", () => {
  const row = rule(".settings-page.settings-detail-view .privacy-row,\n.settings-page.settings-detail-view .privacy-choice");
  expect(row).toContain("min-height: 76px;");
  expect(row).toContain("padding: 12px 18px;");
  expect(row).toContain("grid-template-columns: 36px minmax(0, 1fr) auto;");
  expect(row).not.toMatch(/(?:^|\n)\s*height:/);
});
