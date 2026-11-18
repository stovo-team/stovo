import { readCssSource } from "../test/cssSource";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import postcss from "postcss";

const stylesheet = [
  readCssSource(resolve(process.cwd(), "src/design-system/tokens.css")),
  readCssSource(resolve(process.cwd(), "src/styles.css")),
  readCssSource(resolve(process.cwd(), "src/styles/storage-and-admin.css")),
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
  }, 15_000); // Applying the full app stylesheet can exceed Vitest's default under Windows shard load.

  it("uses theme tokens for create and onboarding surfaces", () => {
    const root = postcss.parse(stylesheet);
    const declarationsFor = (selector: string) => {
      const declarations: Record<string, string> = {};
      root.walkRules(selector, (rule) => {
        rule.walkDecls((declaration) => {
          declarations[declaration.prop] = declaration.value;
        });
      });
      return declarations;
    };

    const create = declarationsFor(".admin-page .mcp-section-box");
    const onboarding = declarationsFor(".mcp-onboarding-step");
    const tag = declarationsFor(".mcp-tag");
    const selectedTag = declarationsFor(".mcp-tag.is-selected");
    const adminTag = declarationsFor(".admin-page .mcp-tag");
    const adminSelectedTag = declarationsFor(".admin-page .mcp-tag.is-selected");
    const checkbox: Record<string, string> = {};
    root.walkRules((rule) => {
      if (rule.selector.split(",").map((selector) => selector.trim()).includes('.mcp-tag input[type="checkbox"]')) {
        rule.walkDecls((declaration) => {
          checkbox[declaration.prop] = declaration.value;
        });
      }
    });
    expect(create.background).toBe("var(--surface-card)");
    expect(create.color).toBe("var(--text-primary)");
    expect(onboarding.background).toBe("var(--surface-hover, var(--surface-card))");
    expect(onboarding.color).toBe("var(--text-primary)");
    expect(tag.background).toBe("var(--surface-card)");
    expect(tag.border).toBe("1px solid var(--border-default)");
    expect(selectedTag.background).toBe("var(--surface-card)");
    expect(selectedTag["border-color"]).toBe("var(--text-secondary)");
    expect(adminTag.background).toBe("var(--surface-card)");
    expect(adminSelectedTag.background).toBe("var(--surface-card)");
    expect(adminSelectedTag["border-color"]).toBe("var(--text-secondary)");
    expect(checkbox["border-radius"]).toBe("var(--radius-small)");
  });
});
