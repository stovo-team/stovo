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

  it("fills a compact message bubble without widening it to the message list", () => {
    expect(styles).toMatch(
      /\.message-audio-attachment,[\s\S]*?\.audio-player \{[^}]*box-sizing: border-box;[^}]*width: 100%;/
    );
    expect(styles).toMatch(
      /\.message-bubble:has\(\.message-audio-attachment\) \{[^}]*max-width: min\(236px, calc\(100vw - 48px\)\);[^}]*width: min\(236px, calc\(100vw - 48px\)\);/
    );
  });

  it("gives the audio attachment wrapper the bubble width", () => {
    expect(styles).toMatch(
      /\.message-bubble:has\(\.message-audio-attachment\) \.message-attachments,[\s\S]*?\.message-bubble:has\(\.message-audio-attachment\) \.message-attachments > div \{[^}]*min-width: 0;[^}]*width: 100%;/
    );
  });

  it("resets min-height on audio player buttons and keeps transcribe button fully circular", () => {
    expect(styles).toMatch(/\.audio-player button \{[^}]*min-height: 0;/);
    expect(styles).toMatch(/\.audio-player-transcribe-btn \{[^}]*border-radius: var\(--radius-circle\);/);
    expect(styles).toMatch(/\.audio-player-transcribe-btn \{[^}]*min-height: 22px;/);
    expect(styles).toMatch(/\.audio-player-transcribe-btn \{[^}]*min-width: 22px;/);
    expect(styles).toMatch(/\.audio-player-transcribe-btn \{[^}]*aspect-ratio: 1 \/ 1;/);
  });
});
