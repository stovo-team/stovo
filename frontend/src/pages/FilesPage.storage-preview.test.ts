import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

function rule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("storage video preview sizing", () => {
  it("stretches the video player across the preview media area", () => {
    expect(rule(".storage-page .storage-preview-media:has(> .video-player)")).toContain("display: block;");
    expect(rule(".storage-page .storage-preview-media > .video-player")).toContain("width: 100%;");
  });
});
