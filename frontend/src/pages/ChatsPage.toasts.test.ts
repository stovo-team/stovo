import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chatsPageSource = readFileSync(
  resolve(process.cwd(), "src/pages/ChatsPage.tsx"),
  "utf8",
);

describe("ChatsPage transient notifications", () => {
  it("does not render in-app toast or floating alert UI", () => {
    expect(chatsPageSource).not.toContain("toast-stack");
    expect(chatsPageSource).not.toContain("toast-card");
    expect(chatsPageSource).not.toContain("floating-alert");
  });
});
