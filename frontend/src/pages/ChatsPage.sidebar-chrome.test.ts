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

  it("keeps the active nav icon and label orange and layered above the translucent active indicator", () => {
    const tabletLayouts = stylesheet.nodes?.filter(
      node =>
        node.type === "atrule" &&
        node.name === "media" &&
        node.params.includes("min-width: 769px") &&
        node.params.includes("max-width: 1199px")
    ) ?? [];

    let activeIconZIndex: string | undefined;
    let activeIconColor: string | undefined;
    let activeIndicatorBg: string | undefined;
    for (const tabletLayout of tabletLayouts) {
      tabletLayout.walkRules(rule => {
        if (rule.selector.includes("a.active .ms-icon")) {
          activeIconZIndex = rule.nodes?.find(node => node.type === "decl" && node.prop === "z-index")?.value
            ?? activeIconZIndex;
          activeIconColor = rule.nodes?.find(node => node.type === "decl" && node.prop === "color")?.value
            ?? activeIconColor;
        }
        if (rule.selector.includes("a.active::before")) {
          activeIndicatorBg = rule.nodes?.find(node => node.type === "decl" && node.prop === "background")?.value
            ?? activeIndicatorBg;
        }
      });
    }

    expect(activeIconZIndex).toBe("1");
    expect(activeIconColor).toContain("var(--stovo-primary)");
    expect(activeIndicatorBg).toContain("color-mix(in oklab, var(--stovo-primary)");
  });

  it("applies the shared wallpaper to every .app-frame page and uses overflow-x: clip for sticky nav", () => {
    let appFrameBg: string | undefined;
    let appFrameOverflowX: string | undefined;
    stylesheet.walkRules(".app-frame", rule => {
      if (rule.parent?.type !== "root") return;
      const bg = rule.nodes?.find(node => node.type === "decl" && node.prop === "background")?.value;
      const ox = rule.nodes?.find(node => node.type === "decl" && node.prop === "overflow-x")?.value;
      if (bg) appFrameBg = bg;
      if (ox) appFrameOverflowX = ox;
    });

    expect(appFrameBg).toBe("var(--messages-panel-background)");
    expect(appFrameOverflowX).toBe("clip");
  });

  it("removes hover states from navigation links and logout button", () => {
    const navHoverDecls: string[] = [];
    stylesheet.walkRules(rule => {
      if (!rule.selector.includes(".app-nav") || !rule.selector.includes(":hover")) return;
      const visualDecls = rule.nodes?.filter(
        node =>
          node.type === "decl" &&
          ((node.prop === "background" && node.value !== "transparent") ||
            node.prop === "color" ||
            node.prop === "box-shadow" ||
            node.prop === "opacity")
      );
      if (visualDecls && visualDecls.length > 0) {
        navHoverDecls.push(rule.selector);
      }
    });

    expect(navHoverDecls).toEqual([]);
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

  it("scopes the 116px chat-list-view top padding to mobile (max-width: 768px)", () => {
    const nonMobileChatListPadding: string[] = [];
    stylesheet.walkAtRules("media", atRule => {
      if (atRule.params.includes("max-width: 768px")) return;
      atRule.walkRules(rule => {
        if (
          rule.selector.includes(':root[data-platform="web"]') &&
          rule.selector.includes(".chat-list-view .chat-list") &&
          rule.nodes?.some(
            node => node.type === "decl" && node.prop === "padding-top" && node.value.includes("--web-chat-sidebar-header-height")
          )
        ) {
          nonMobileChatListPadding.push(`${atRule.params} :: ${rule.selector}`);
        }
      });
    });

    expect(nonMobileChatListPadding).toEqual([]);
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
