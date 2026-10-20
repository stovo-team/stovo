import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const styles = readFileSync("src/styles.css", "utf8");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return start < 0 ? "" : styles.slice(start, styles.indexOf("}", start));
};
it("keeps the profile chevron beside the profile copy instead of pushing it to the far edge", () => {
  expect(rule(".settings-profile-open")).toContain("justify-content: flex-start;");
  expect(rule(".settings-profile-open > svg")).toContain("margin-left: 0;");
});
