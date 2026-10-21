import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("gives PDFs and Word documents a taller preview with controls over the document", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const selector = '.storage-page .storage-preview-media:has(.document-preview-card--inline:is([data-preview-kind="pdf"], [data-preview-kind="docx"]))';
  const start = styles.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const rule = styles.slice(start, styles.indexOf("}", start));
  expect(rule).toContain("padding: 0;");
  expect(styles).toContain("--storage-preview-height: min(78dvh, 960px);");
});
