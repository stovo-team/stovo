import { readCssSource } from "./src/test/cssSource";
import { expect, it } from "vitest";
const styles = readCssSource("src/styles.css");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return start < 0 ? "" : styles.slice(start, styles.indexOf("}", start));
};
it("draws a white clock in dark time selectors without replacing native picker behavior", () => {
  expect(styles).toContain(':root:is([data-theme-mode="dark"], [data-theme-mode="amoled"]) .settings-page input[type="time"]::-webkit-calendar-picker-indicator');
  expect(styles).toContain("stroke='%23ffffff'");
  expect(styles).toContain('input[type="time"] {\n  color-scheme: dark;');
});
