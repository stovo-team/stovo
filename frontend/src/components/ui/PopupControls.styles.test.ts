import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/components/ui/Popup.css", "utf8");

function ruleFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "s"))?.[1] ?? "";
}

describe("shared popup control dimensions", () => {
  it("keeps all action variants 44px high and fully rounded", () => {
    const button = ruleFor(".popup-button");
    expect(button).toMatch(/height:\s*44px/);
    expect(button).toMatch(/border-radius:\s*999px/);
  });

  it("keeps text inputs 46px high and fully rounded", () => {
    const input = ruleFor(".popup-field__input");
    expect(input).toMatch(/height:\s*46px/);
    expect(input).toMatch(/border-radius:\s*999px/);
    expect(input).toMatch(/var\(--surface-card\)/);
  });

  it("uses accent and danger theme tokens for the respective controls", () => {
    expect(ruleFor(".popup-button--primary")).toMatch(/var\(--accent-primary\)/);
    expect(ruleFor(".popup-button--danger")).toMatch(/var\(--danger\)/);
    expect(ruleFor(".popup-field__input:focus")).toMatch(/var\(--accent-primary\)/);
  });
});
