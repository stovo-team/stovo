import { readCssSource } from "../test/cssSource";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

describe("Storage mobile grid and source dropdown gap", () => {
  it("expands storage file tiles across the available width on standard phone viewports", () => {
    // Standard phone viewports (>=360px up to 767px) must expand tiles with minmax and 1fr
    // so two tiles do not leave a massive empty void on the right when a third tile cannot fit.
    expect(styles).toMatch(
      /@media\s*\([^)]*360px[^)]*\)[\s\S]*?\.storage-page \.storage-grid\s*\{[^}]*grid-template-columns:[^}]*minmax\([^}]*1fr\)/
    );
  });

  it("provides an explicit avatar size and comfortable gap between avatar and chat title in mobile dropdown", () => {
    // Scoped avatar size prevents desktop 40px override from overflowing the dropdown item column
    expect(styles).toMatch(
      /\.storage-page \.storage-mobile-source-menu \.storage-source-avatar\s*\{[^}]*width:\s*32px/
    );
    // Menu item button gap or column ensures at least 12px gap between icon and title
    expect(styles).toMatch(
      /\.storage-mobile-source-menu button\s*\{[^}]*gap:\s*12px/
    );
  });
});
