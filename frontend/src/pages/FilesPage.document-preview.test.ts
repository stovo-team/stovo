import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

function rule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("storage document preview sizing", () => {
  it("stretches the preview grid track to fill the details panel", () => {
    expect(rule(".storage-page .storage-preview:has(.document-preview-card)")).toContain(
      "grid-template-columns: minmax(0, 1fr);",
    );
  });
});
