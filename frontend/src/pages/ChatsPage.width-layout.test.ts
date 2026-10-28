import { readCssSource } from "../test/cssSource";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readCssSource(resolve(process.cwd(), "src/styles.css"));

describe("wide-screen chat width priority", () => {
  it("keeps the chat list compact and centers the capped chat on wide screens", () => {
    const chatLayoutRule = styles.match(/\.messenger-shell \.chat-layout:not\(\.voice-call-expanded\)\s*\{([^}]*)\}/)?.[1] ?? "";
    const chatDetailRule = styles.match(/\.messenger-shell \.chat-layout:not\(\.voice-call-expanded\)\s*>\s*\.chat-detail\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(chatLayoutRule.replace(/\s+/g, " ")).toContain("grid-template-columns: 322px minmax(0, 1fr)");
    expect(chatDetailRule).toContain("max-width: 1400px;");
    expect(chatDetailRule).toContain("justify-self: center;");
  });

  it("keeps the chat list minimum and voice-call expanded grid", () => {
    expect(styles).toContain("grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);");
    expect(styles).toContain(".chat-layout.voice-call-expanded,");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr);");
  });
});
