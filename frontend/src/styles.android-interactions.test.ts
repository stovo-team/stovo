import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

describe("Android button interactions", () => {
  it("does not show browser tap highlights or apply desktop hover feedback", () => {
    expect(styles).toMatch(/button \{[\s\S]*?-webkit-tap-highlight-color: transparent;/);
    expect(styles).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\) \{\s*button:hover:not\(:disabled\) \{/,
    );
  });

  it("does not move ordinary buttons while they are touched", () => {
    expect(styles).toMatch(
      /@media \(hover: none\) \{\s*button:active:not\(:disabled\) \{\s*transform: none !important;/,
    );
  });
});
