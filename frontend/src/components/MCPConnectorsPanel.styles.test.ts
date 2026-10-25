import { readCssSource } from "../test/cssSource";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const stylesheet = [
  readCssSource(resolve(process.cwd(), "src/design-system/tokens.css")),
  readCssSource(resolve(process.cwd(), "src/styles.css")),
].join("\n");

let styleElement: HTMLStyleElement | null = null;

afterEach(() => {
  styleElement?.remove();
  styleElement = null;
  document.body.replaceChildren();
});

describe("MCP connector settings button", () => {
  it("stays a square circle inside the admin connector actions", () => {
    styleElement = document.createElement("style");
    styleElement.textContent = stylesheet;
    document.head.appendChild(styleElement);

    const page = document.createElement("main");
    page.className = "app-shell app-frame admin-page admin-detail-page";
    page.innerHTML = `
      <section class="page-surface admin-surface">
        <section class="mcp-connectors-admin-section admin-panel">
          <section class="mcp-connectors-panel">
            <div class="public-access-actions">
              <button type="button" class="icon-button mcp-icon-button" aria-label="Configure connection"></button>
            </div>
          </section>
        </section>
      </section>
    `;
    document.body.appendChild(page);

    const button = page.querySelector("button");
    expect(button).toBeTruthy();
    const style = getComputedStyle(button!);
    const side = style.width;

    expect(side).toMatch(/^\d+px$/);
    expect(style.height).toBe(side);
    expect(style.minWidth).toBe(side);
    expect(style.minHeight).toBe(side);
    expect(style.maxWidth).toBe(side);
    expect(style.maxHeight).toBe(side);
    expect(style.paddingLeft).toBe("0px");
    expect(style.paddingRight).toBe("0px");
    expect(["50%", "var(--radius-circle)"]).toContain(style.borderRadius);
  });
});
