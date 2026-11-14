import { readCssSource } from "../test/cssSource";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = parse(readCssSource("src/styles.css"));

describe("left nav and chat sidebar chrome", () => {
  it("keeps the left nav rail background intact above 768px", () => {
    const transparentNavRules: string[] = [];
    stylesheet.walkAtRules("media", atRule => {
      if (atRule.params.includes("max-width: 768px")) return;
      atRule.walkRules(rule => {
        const selectors = rule.selector.split(",").map(s => s.trim());
        if (
          selectors.some(
            s => s === ".app-frame > .app-nav" || s === ':root[data-platform="web"] .app-frame > .app-nav.app-nav--active-variant-a'
          ) &&
          rule.nodes?.some(node => node.type === "decl" && node.prop === "background" && node.value === "transparent")
        ) {
          transparentNavRules.push(`${atRule.params} :: ${rule.selector}`);
        }
      });
    });

    expect(transparentNavRules).toEqual([]);
  });

  it("keeps the active nav icon and label above the tablet active indicator", () => {
    const tabletLayout = stylesheet.nodes?.find(
      node =>
        node.type === "atrule" &&
        node.name === "media" &&
        node.params.includes("min-width: 769px") &&
        node.params.includes("max-width: 1199px")
    );

    let activeIconZIndex: string | undefined;
    let activeIconColor: string | undefined;
    tabletLayout?.walkRules(rule => {
      if (rule.selector.includes("a.active .ms-icon")) {
        activeIconZIndex = rule.nodes?.find(node => node.type === "decl" && node.prop === "z-index")?.value;
        activeIconColor = rule.nodes?.find(node => node.type === "decl" && node.prop === "color")?.value;
      }
    });

    expect(activeIconZIndex).toBe("1");
    expect(activeIconColor).toContain("var(--color-palette-f2074b6cef37)");
  });

  it("keeps the web chat sidebar header background transparent", () => {
    const opaqueHeaderRules: string[] = [];
    stylesheet.walkRules(rule => {
      if (
        (rule.selector === ':root[data-platform="web"] .messenger-shell.chat-list-view .chat-sidebar-header' ||
          rule.selector === ".chat-sidebar-header") &&
        rule.nodes?.some(
          node => node.type === "decl" && node.prop === "background" && node.value.includes("linear-gradient")
        )
      ) {
        opaqueHeaderRules.push(rule.selector);
      }
    });

    expect(opaqueHeaderRules).toEqual([]);
  });

  it("gives desktop 1200px-1599px viewports a wider chat sidebar than 280px", () => {
    const desktopMedium = stylesheet.nodes?.find(
      node =>
        node.type === "atrule" &&
        node.name === "media" &&
        node.params.includes("min-width: 1200px") &&
        node.params.includes("max-width: 1599px")
    );

    let columns: string | undefined;
    desktopMedium?.walkRules(".messenger-shell .chat-layout:not(.voice-call-expanded)", rule => {
      columns = rule.nodes?.find(node => node.type === "decl" && node.prop === "grid-template-columns")?.value;
    });

    expect(columns).toBeDefined();
    expect(columns).not.toContain("280px");
  });
});
