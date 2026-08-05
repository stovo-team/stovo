import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("active chat list item styling", () => {
  it("uses a brighter accent background without a left indicator", () => {
    const activeRule = Array.from(
      styles.matchAll(/\.chat-list-item\.active \{([^}]*)\}/g)
    ).at(-1)?.[1] ?? "";

    expect(activeRule).toContain(
      "background: color-mix(in oklab, var(--accent-soft) 28%, transparent);"
    );
    expect(activeRule).toContain("border-radius: 22px;");
    expect(activeRule).not.toContain("border-left");
  });
});
