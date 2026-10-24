import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/components/ui/Popup.css", "utf8");

function ruleFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "s"))?.[1] ?? "";
}

describe("shared popup dropdown styles", () => {
  it("uses a 16px chevron slot and a 46px pill trigger", () => {
    expect(ruleFor(".popup-select__chevron")).toMatch(/width:\s*16px/);
    expect(ruleFor(".popup-select__chevron")).toMatch(/height:\s*16px/);
    expect(ruleFor(".popup-select__trigger")).toMatch(/height:\s*46px/);
    expect(ruleFor(".popup-select__trigger")).toMatch(/border-radius:\s*999px/);
  });

  it("uses an 18px rounded menu without decorative pointer or separators", () => {
    expect(ruleFor(".popup-select__menu")).toMatch(/border-radius:\s*18px/);
    expect(styles).not.toMatch(/\.popup-select__menu::(?:before|after)/);
    expect(ruleFor(".popup-select__option")).not.toMatch(/border-bottom:\s*1px/);
  });
});
