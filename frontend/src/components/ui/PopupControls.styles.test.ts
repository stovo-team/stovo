import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/components/ui/Popup.css", "utf8");
const appEntry = readFileSync("src/main.tsx", "utf8");
const appStyles = readFileSync("src/styles.css", "utf8");

function ruleFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "s"))?.[1] ?? "";
}

describe("shared popup control dimensions", () => {
  it("uses the app typography tokens for popup text", () => {
    expect(appEntry.indexOf('./design-system/tokens.css')).toBeLessThan(appEntry.indexOf('./styles.css'));
    expect(appStyles).toMatch(/font-family:\s*var\(--font-family-ui\)/);
    expect(ruleFor(".popup-dialog")).toMatch(/font-family:\s*var\(--font-family-ui\)/);
    expect(ruleFor(".popup-button")).toMatch(/font-size:\s*var\(--font-size-button\)/);
    expect(ruleFor(".popup-button")).toMatch(/font-weight:\s*var\(--font-weight-semibold\)/);
    expect(ruleFor(".popup-field__input")).toMatch(/font-size:\s*var\(--font-size-small\)/);
  });

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
