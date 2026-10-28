import { readCssSource } from "../test/cssSource";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

describe("wide-screen chat width priority", () => {
  it("lets the chat list absorb width after the active chat reaches 1400px", () => {
    const chatLayoutRule = styles.match(/\.messenger-shell \.chat-layout:not\(\.voice-call-expanded\)\s*\{([^}]*)\}/)?.[1] ?? "";
    const chatDetailRule = styles.match(/\.messenger-shell \.chat-layout:not\(\.voice-call-expanded\)\s*>\s*\.chat-detail\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(chatLayoutRule.replace(/\s+/g, " ")).toContain("grid-template-columns: minmax(320px, 1fr) minmax(0, min(1400px, calc(100% - 320px - var(--float-panel-gap))))");
    expect(chatDetailRule).toContain("max-width: 1400px;");
  });

  it("keeps the chat list minimum and voice-call expanded grid", () => {
    expect(styles).toContain("grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);");
    expect(styles).toContain(".chat-layout.voice-call-expanded,");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr);");
  });
});
