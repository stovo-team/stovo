import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return start < 0 ? "" : styles.slice(start, styles.indexOf("}", start));
};

it("keeps the profile chevron slightly inset from the profile bar edge", () => {
  expect(rule(".settings-profile-open")).toContain("padding: 18px 22px 18px 126px;");
  const chevron = rule(".settings-profile-open > svg");
  expect(chevron).toContain("right: 22px;");
  expect(chevron).toContain("height: 18px;");
  expect(chevron).toContain("width: 18px;");
});
