import { readCssSource } from "./src/test/cssSource";
import { expect, it } from "vitest";

it("separates the reply preview from the composer input", () => {
  const styles = readCssSource("src/styles.css");
  expect(styles).toMatch(/\.reply-composer-preview\s*\{[^}]*margin-bottom:\s*10px;/);
});
