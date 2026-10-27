import { readCssSource } from "../../../test/cssSource";
import { describe, expect, it } from "vitest";

const styles = readCssSource("src/styles.css");
const rule = (selector: string) => {
  const start = styles.indexOf(`${selector} {`);
  return styles.slice(start, styles.indexOf("}", start));
};

describe("chat details overflow menu styles", () => {
  it("matches menu item roundness to the dropdown surface", () => {
    expect(rule(".chat-info-overflow-menu")).toContain("border-radius: var(--radius-surface);");
    expect(rule(".chat-info-overflow-menu button")).toContain("border-radius: inherit;");
  });
});
