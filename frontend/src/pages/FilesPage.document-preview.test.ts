import { readCssSource } from "../test/cssSource";
import { describe, expect, it } from "vitest";

const styles = readCssSource("src/styles.css");

function rule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...styles.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g"))];
  return matches.map((match) => match[1]).join("\n");
}

describe("storage document preview sizing", () => {
  it("gives inline document previews a bounded scrollable viewport", () => {
    expect(rule(".storage-page .storage-preview-media:has(.document-preview-card)")).toContain("max-height: min(64dvh, 720px);");
    expect(rule(".storage-page .storage-preview-media:has(.document-preview-card)")).toContain("overflow: auto;");
  });
});
