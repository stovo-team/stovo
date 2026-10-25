import { resolve } from "node:path";
import { transform } from "lightningcss";
import { describe, expect, it } from "vitest";
import { readCssSource } from "../test/cssSource";

/**
 * Production Vite builds minify CSS with Lightning CSS and browser targets.
 * That path rewrites comma-separated selectors into :is(...), which takes the
 * max specificity of every branch — including a non-matching
 * :has(.storage-tile.selected) branch. A stale two-column Storage rule then
 * outranks the real three-column layout (source | resizer | main), so the main
 * pane wraps under the source list and leaves an empty right column.
 */
describe("Storage layout survives production CSS minify", () => {
  it("does not let a two-column :is() rewrite beat the source/resizer/main grid", () => {
    const source = readCssSource(resolve(process.cwd(), "src/styles.css"));
    const { code } = transform({
      filename: "styles.css",
      code: Buffer.from(source),
      minify: true,
      // Match Vite's production minify path, which enables :is() rewriting.
      targets: { chrome: 100 << 16 },
    });
    const minified = code.toString();

    expect(minified).not.toContain(
      ":is(.storage-page .storage-layout,.storage-page:has(.storage-tile.selected) .storage-layout){grid-template-columns:300px minmax(0,1fr)}"
    );
    expect(minified).toMatch(
      /\.storage-page \.storage-layout:not\(\.storage-layout--source-collapsed\)\{[^}]*grid-template-columns:\s*var\(--storage-source-width,\s*300px\)\s+12px\s+minmax\(0,\s*1fr\)/
    );
  });
});
