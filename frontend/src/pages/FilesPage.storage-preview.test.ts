import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

function rule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...styles.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g"))];
  return matches.map((match) => match[1]).join("\n");
}

describe("storage video preview sizing", () => {
  it("opens the selected file over the grid without adding a details column", () => {
    expect(styles).not.toMatch(/\.storage-page:has\(\.storage-tile\.selected\) \.storage-layout\s*\{[^}]*grid-template-columns:[^}]*minmax\(380px/);
    expect(rule(".storage-page.has-storage-selection .storage-details-panel")).toContain("position: fixed;");
    expect(rule(".storage-page.has-storage-selection .storage-details-panel")).toContain("right: 24px;");
    expect(rule(".storage-page.has-storage-selection .storage-details-panel")).toContain("width: min(900px, calc(100vw - 48px));");
  });

  it("stretches the video player across an adaptive preview media area", () => {
    expect(rule(".storage-page .storage-preview-media:has(> .video-player)")).toContain("display: block;");
    expect(rule(".storage-page .storage-preview-media > .video-player")).toContain("width: 100%;");
    expect(rule(".storage-page .storage-preview-media > .video-player")).toContain("max-height: min(68dvh, 700px);");
  });
});
