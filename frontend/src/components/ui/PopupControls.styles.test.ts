import { readCssSource } from "../../test/cssSource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/components/ui/Popup.css", "utf8");
const appEntry = readFileSync("src/main.tsx", "utf8");
const appStyles = readCssSource("src/styles.css");

function ruleFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "s"))?.[1] ?? "";
}

describe("shared popup control dimensions", () => {
  it("hides native number input spinner arrows across browsers", () => {
    expect(appStyles).toMatch(/input\[type="number"\]\s*\{[^}]*appearance:\s*textfield;/s);
    expect(appStyles).toMatch(/input\[type="number"\]::-webkit-inner-spin-button[\s\S]*?appearance:\s*none;/);
  });

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

  it("gives popup labels a small inset and keeps select triggers the same height as inputs", () => {
    const label = ruleFor(".popup-field__label");
    const input = ruleFor(".popup-field__input");
    const select = ruleFor(".popup-select__trigger");
    expect(label).toMatch(/padding-inline-start:\s*8px/);
    expect(select).toMatch(/height:\s*46px/);
    expect(input).toMatch(/height:\s*46px/);
  });

  it("left-aligns popup headings and does not add button focus rings", () => {
    const dialogHeading = ruleFor(".popup-dialog h2");
    expect(dialogHeading).toMatch(/text-align:\s*left/);
    expect(appStyles).toMatch(/:focus\s*,\s*:focus-visible\s*\{\s*outline:\s*none\s*!important;\s*box-shadow:\s*none\s*!important;/);
  });

  it("uses accent and danger theme tokens for the respective controls", () => {
    expect(ruleFor(".popup-button--primary")).toMatch(/var\(--accent-primary\)/);
    expect(ruleFor(".popup-button--danger")).toMatch(/var\(--danger\)/);
    expect(ruleFor(".popup-field__input:focus")).toMatch(/var\(--accent-primary\)/);
  });
});
