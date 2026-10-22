import { readCssSource } from "./src/test/cssSource";
import { expect, it } from "vitest";

const styles = readCssSource("src/styles.css");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return start < 0 ? "" : styles.slice(start, styles.indexOf("}", start));
};

it("aligns the profile chevron with the settings rows using the same right inset", () => {
  expect(rule(".settings-profile-open")).toContain("padding: 18px 22px 18px 126px;");
  expect(rule(".settings-profile-open > svg")).toContain("margin-left: auto;");
});
