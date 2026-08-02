import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("compact audio message styling", () => {
  it("keeps a visible seek track without forcing a wide message bubble", () => {
    expect(styles).toMatch(
      /\.audio-player-wave \{[^}]*width: 100%;/
    );
  });

  it("allows the seek track to shrink inside a narrow audio bubble", () => {
    expect(styles).toMatch(
      /\.audio-player-wave \{[^}]*min-width: 0;/
    );
  });

  it("fills the message bubble without forcing a fixed audio width", () => {
    expect(styles).toMatch(
      /\.message-audio-attachment,[\s\S]*?\.audio-player \{[^}]*width: 100%;/
    );
    expect(styles).toMatch(
      /\.message-bubble:has\(\.message-audio-attachment\) \{[^}]*width: 100%;/
    );
    expect(styles).not.toMatch(
      /\.message-bubble:has\(\.message-audio-attachment\) \{[^}]*max-width: min\(236px, calc\(100vw - 48px\)\);/
    );
  });
});
