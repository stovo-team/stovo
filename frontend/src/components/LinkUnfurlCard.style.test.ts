import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("link unfurl message sizing", () => {
  it("keeps OG preview bubbles compact and responsive", () => {
    expect(styles).toMatch(
      /\.message-bubble:has\(\.link-unfurl-card\) \{[^}]*max-width: min\(360px, calc\(100vw - 48px\)\);[^}]*width: min\(360px, calc\(100vw - 48px\)\);/
    );
    expect(styles).toMatch(
      /\.message-bubble:has\(\.link-unfurl-card\) \.link-unfurl-card \{[^}]*max-width: 100%;[^}]*width: 100%;/
    );
  });
});
