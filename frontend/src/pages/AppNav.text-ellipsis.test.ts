import { readCssSource } from "../test/cssSource";
import { describe, expect, it } from "vitest";

const styles = readCssSource("src/styles.css").replace(/\r\n/g, "\n");

describe("bottom navigation text overflow and ellipsis truncation", () => {
  it("enforces single-line text ellipsis truncation on all bottom nav labels", () => {
    // Labels must stay on one line, clip overflow, and truncate with 3 dots (ellipsis)
    expect(styles).toMatch(
      /\.app-nav a > span:not\(\.ms-icon\):not\(\.nav-badge\)\s*\{[^}]*text-overflow:\s*ellipsis;/
    );
    expect(styles).toMatch(
      /\.app-nav a > span:not\(\.ms-icon\):not\(\.nav-badge\)\s*\{[^}]*overflow:\s*hidden;/
    );
    expect(styles).toMatch(
      /\.app-nav a > span:not\(\.ms-icon\):not\(\.nav-badge\)\s*\{[^}]*white-space:\s*nowrap;/
    );
    expect(styles).toMatch(
      /\.app-nav a > span:not\(\.ms-icon\):not\(\.nav-badge\)\s*\{[^}]*max-width:\s*100%;/
    );
    expect(styles).toMatch(
      /\.app-nav a > span:not\(\.ms-icon\):not\(\.nav-badge\)\s*\{[^}]*display:\s*block;/
    );
    expect(styles).toMatch(
      /\.app-nav a > span:not\(\.ms-icon\):not\(\.nav-badge\)\s*\{[^}]*min-width:\s*0;/
    );
  });

  it("allows containing flex items and nav links to shrink below content width", () => {
    // In flex layouts, items refuse to shrink below their content by default (min-width: auto).
    // Per single-line-overflow guidance, containing flex items must set min-width: 0 so labels can truncate.
    expect(styles).toMatch(
      /\.app-frame > \.app-nav \.app-nav-links > a\s*\{[^}]*min-width:\s*0;/
    );
    expect(styles).toMatch(
      /\.app-frame > \.app-nav a\s*\{[^}]*min-width:\s*0;/
    );
    expect(styles).toMatch(
      /\.app-frame > \.app-nav \.app-nav-links\s*\{[^}]*min-width:\s*0;/
    );
  });

  it("maintains ellipsis truncation when active navigation item is highlighted", () => {
    // Active navigation state must keep ellipsis truncation intact without expanding out of bounds
    expect(styles).toMatch(
      /\.app-frame > \.app-nav(\.app-nav--active-variant-a)? a\.active > span:not\(\.ms-icon\)[^{]*\{[^}]*text-overflow:\s*ellipsis;/
    );
  });
});
