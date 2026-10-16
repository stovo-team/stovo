import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(styles.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")), (match) => match[1]).join("\n");
}

describe("chat transfer controls", () => {
  it("uses a custom, themed dropdown with a non-intercepting chevron", () => {
    expect(declarations(".chat-transfer-profile-control")).toMatch(/position:\s*relative/);
    expect(declarations(".chat-transfer-profile-control select")).toMatch(/appearance:\s*none/);
    expect(declarations(".chat-transfer-profile-control select")).toMatch(/padding:\s*10px\s+42px\s+10px\s+14px/);
    expect(declarations(".chat-transfer-profile-control select option")).toMatch(/background:\s*var\(--surface-card\)/);
    expect(declarations(".chat-transfer-profile-chevron")).toMatch(/pointer-events:\s*none/);
  });

  it("gives the file picker equal outer padding and aligns settings actions left", () => {
    expect(declarations(".chat-transfer-file-picker")).toMatch(/padding:\s*8px\s*;/);
    expect(declarations(".chat-transfer-settings-action")).toMatch(/justify-content:\s*flex-start/);
  });
});
