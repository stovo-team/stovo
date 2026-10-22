import { readCssSource } from "../test/cssSource";
import { expect, it } from "vitest";

it("does not inset document media inside its preview frame", () => {
  const styles = readCssSource("src/styles.css");
  const rule = styles.match(/\.storage-page \.storage-preview-media:has\(\.document-preview-card--inline\)\s*\{([^}]+)\}/)?.[1];
  expect(rule).toContain("padding: 0;");
});
