import { describe, expect, it } from "vitest";
import { readTextFile } from "../../../testUtils/readTextFile";

const styles = readTextFile("src/styles.css");

describe("chat notification selector on small screens", () => {
  it("anchors its open dropdown to the bottom edge", () => {
    const mobileRules = styles.match(/@media \(max-width: 1024px\) \{([\s\S]*?)\n\}\n\n\.chat-info-unmute-btn/)?.[1] ?? "";
    const notificationRule = Array.from(mobileRules.matchAll(/\.chat-info-mute-menu-options\s*\{([^}]*)\}/g)).at(-1)?.[1];

    expect(notificationRule).toMatch(/position:\s*fixed/);
    expect(notificationRule).toMatch(/bottom:/);
    expect(notificationRule).toMatch(/top:\s*auto/);
  });
});
