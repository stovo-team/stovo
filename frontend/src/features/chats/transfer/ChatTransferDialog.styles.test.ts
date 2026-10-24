import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const popupStyles = readFileSync(resolve(process.cwd(), "src/components/ui/Popup.css"), "utf8");
const dialogSource = readFileSync(resolve(process.cwd(), "src/features/chats/transfer/ChatTransferDialog.tsx"), "utf8");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(styles.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")), (match) => match[1]).join("\n");
}

describe("chat transfer controls", () => {
  it("uses the shared rounded dropdown and keeps its chevron at a fixed size", () => {
    expect(dialogSource).toContain("<PopupSelect");
    expect(popupStyles).toMatch(/\.popup-select__trigger\s*\{[^}]*height:\s*46px;[^}]*border-radius:\s*999px;/s);
    expect(popupStyles).toMatch(/\.popup-select__chevron\s*\{[^}]*width:\s*16px;[^}]*flex:\s*0\s+0\s+16px;/s);
  });

  it("gives the file picker equal outer padding and aligns settings actions left", () => {
    expect(declarations(".chat-transfer-file-picker")).toMatch(/padding:\s*8px\s*;/);
    expect(declarations(".chat-transfer-settings-action")).toMatch(/justify-content:\s*flex-start/);
  });
});
