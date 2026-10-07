import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("mobile chat emoji picker", () => {
  it("keeps the popup within the viewport instead of centering it off the composer edge", () => {
    const mobileRule = styles.match(
      /@media \(max-width: 960px\) \{[\s\S]*?\.messenger-shell\.has-active-chat \.emoji-picker \{([^}]*)\}/
    )?.[1] ?? "";

    expect(mobileRule).toContain("left: 0;");
    expect(mobileRule).toContain("transform: none;");
    expect(mobileRule).toMatch(/max-width:\s*min\(360px,\s*calc\(100vw\s*-\s*var\(--active-chat-message-inset-x/);
    expect(mobileRule).toContain("width: min(360px, calc(100vw - var(--active-chat-message-inset-x");
  });
});
