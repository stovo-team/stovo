import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appDocument = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

describe("root Open Graph metadata", () => {
  it("uses the deployed app origin for its canonical URL and available image", () => {
    expect(appDocument).toContain('<meta property="og:url" content="https://app.stovo.cc/" />');
    expect(appDocument).toContain('<meta property="og:image" content="https://app.stovo.cc/og-image.png" />');
    expect(appDocument).toContain('<meta name="twitter:image" content="https://app.stovo.cc/og-image.png" />');
  });
});
