import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/FilesPage.tsx"), "utf8");

describe("Storage audio preview", () => {
  it("uses the app audio player instead of browser-native controls", () => {
    expect(page).toContain("<AudioPlayer");
    expect(page).not.toMatch(/<audio controls src=\{selectedMediaUrl\}/);
  });
});
