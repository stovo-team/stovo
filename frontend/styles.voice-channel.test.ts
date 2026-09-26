import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

const rule = (selector: string) => {
  const start = styles.lastIndexOf(`${selector} {`);
  return styles.slice(start, styles.indexOf("}", start));
};

describe("voice channel empty state presentation", () => {
  it("centers the empty state and member invite together in both axes", () => {
    const content = rule(".voice-room-empty-content");
    expect(content).toContain("display: flex;");
    expect(content).toContain("align-items: center;");
    expect(content).toContain("justify-content: center;");
  });

  it("removes the stage border and join button glow", () => {
    expect(rule(".voice-room-stage")).not.toMatch(/border(?:-[a-z]+)?:\s*[^;]+;/);
    expect(rule(".voice-room-primary-join-btn")).toContain("box-shadow: none;");
  });
});
