import { readCssSource } from "../../test/cssSource";
import { describe, expect, it } from "vitest";

const styles = readCssSource("src/styles.css");

describe("Appearance mobile layout", () => {
  it("stacks inline appearance section cards to 1 column on mobile so titles move to top", () => {
    // Under max-width: 720px, inline appearance card must use grid-template-columns: 1fr
    const mobileBlockMatch = styles.match(/@media\s*\([^)]*max-width:\s*720px[^)]*\)\s*\{([\s\S]*?)(?=@media|$)/g);
    expect(mobileBlockMatch).not.toBeNull();
    const combinedMobileBlocks = mobileBlockMatch?.join("\n") ?? "";

    expect(combinedMobileBlocks).toMatch(
      /\.settings-page\.settings-appearance-view\s+\.appearance-section-card\.appearance-section-card--inline\s*\{[^}]*grid-template-columns:\s*1fr/
    );
  });

  it("arranges presets in a 2-column equal-size grid on mobile", () => {
    const mobileBlockMatch = styles.match(/@media\s*\([^)]*max-width:\s*720px[^)]*\)\s*\{([\s\S]*?)(?=@media|$)/g);
    const combinedMobileBlocks = mobileBlockMatch?.join("\n") ?? "";

    expect(combinedMobileBlocks).toMatch(
      /\.settings-page\.settings-appearance-view\s+\.appearance-presets-grid\s*\{[^}]*display:\s*grid/
    );
    expect(combinedMobileBlocks).toMatch(
      /\.settings-page\.settings-appearance-view\s+\.appearance-presets-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(combinedMobileBlocks).toMatch(
      /\.settings-page\.settings-appearance-view\s+\.appearance-preset-card\s*\{[^}]*width:\s*100%/
    );
  });

  it("aligns wallpaper thumbnails to the start on mobile to prevent overlapping titles", () => {
    const mobileBlockMatch = styles.match(/@media\s*\([^)]*max-width:\s*720px[^)]*\)\s*\{([\s\S]*?)(?=@media|$)/g);
    const combinedMobileBlocks = mobileBlockMatch?.join("\n") ?? "";

    expect(combinedMobileBlocks).toMatch(
      /\.settings-page\.settings-appearance-view\s+\.appearance-wallpaper-grid\s*\{[^}]*justify-content:\s*flex-start/
    );
  });
});
