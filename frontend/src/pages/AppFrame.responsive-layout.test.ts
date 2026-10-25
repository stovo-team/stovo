import { readCssSource } from "../test/cssSource";
import { parse } from "postcss";
import { expect, it } from "vitest";

it("keeps app pages beside the nav rail and chat list plain at tablet widths", () => {
  const stylesheet = parse(readCssSource("src/styles.css"));
  const tabletLayout = stylesheet.nodes?.find(
    node => node.type === "atrule"
      && node.name === "media"
      && node.params.includes("min-width: 769px")
      && node.params.includes("max-width: 1024px")
  );
  let navGridColumn: string | undefined;
  let navWidth: string | undefined;
  let navActiveBackground: string | undefined;
  let navActiveRadius: string | undefined;
  let navActiveIndicatorContent: string | undefined;
  let navActiveIndicatorHeight: string | undefined;
  let navActiveIndicatorWidth: string | undefined;
  let pageGridColumn: string | undefined;
  let chatPaneColumns: string | undefined;
  let chatSidebarBackground: string | undefined;
  let chatSidebarBorder: string | undefined;
  let chatSidebarShadow: string | undefined;
  let chatSidebarHeaderBorder: string | undefined;
  let chatDetailBorder: string | undefined;
  let chatEmptyCardBorder: string | undefined;
  let chatEmptyCardBackground: string | undefined;
  let chatEmptyCardShadow: string | undefined;
  let chatEmptyIconBackground: string | undefined;
  let chatEmptyIconShadow: string | undefined;
  let chatEmptyActionShadow: string | undefined;
  let chatHeaderMinHeight: string | undefined;
  let chatHeaderPadding: string | undefined;
  let chatAvatarHeight: string | undefined;
  let chatActionHeight: string | undefined;

  tabletLayout?.walkRules(".app-frame > .app-nav.app-nav--active-variant-a", rule => {
    navGridColumn = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "grid-column"
    )?.value;
    navWidth = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "width"
    )?.value;
  });

  tabletLayout?.walkRules(".app-frame > .app-nav.app-nav--active-variant-a a.active", rule => {
    navActiveBackground = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "background"
    )?.value;
    navActiveRadius = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "border-radius"
    )?.value;
  });

  tabletLayout?.walkRules(".app-frame > .app-nav.app-nav--active-variant-a a.active::before", rule => {
    navActiveIndicatorContent = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "content"
    )?.value;
    navActiveIndicatorHeight = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "height"
    )?.value;
    navActiveIndicatorWidth = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "width"
    )?.value;
  });

  tabletLayout?.walkRules(".app-frame > :not(.app-nav)", rule => {
    pageGridColumn = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "grid-column"
    )?.value;
  });

  tabletLayout?.walkRules(".messenger-shell .chat-layout", rule => {
    chatPaneColumns = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "grid-template-columns"
    )?.value;
  });

  tabletLayout?.walkRules(".messenger-shell .chat-sidebar", rule => {
    chatSidebarBackground = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "background"
    )?.value;
    chatSidebarBorder = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "border"
    )?.value;
    chatSidebarShadow = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "box-shadow"
    )?.value;
  });

  tabletLayout?.walkRules(".messenger-shell.chat-list-view .chat-sidebar-header", rule => {
    chatSidebarHeaderBorder = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "border-bottom"
    )?.value;
  });

  tabletLayout?.walkRules(".messenger-shell.chat-list-view .chat-detail", rule => {
    chatDetailBorder = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "border"
    )?.value;
  });

  tabletLayout?.walkRules(".messenger-shell.chat-list-view .chat-empty-state-card", rule => {
    chatEmptyCardBackground = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "background"
    )?.value;
    chatEmptyCardBorder = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "border"
    )?.value;
    chatEmptyCardShadow = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "box-shadow"
    )?.value;
  });

  tabletLayout?.walkRules(".messenger-shell.chat-list-view .chat-empty-icon-pill", rule => {
    chatEmptyIconBackground = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "background"
    )?.value;
    chatEmptyIconShadow = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "box-shadow"
    )?.value;
  });

  tabletLayout?.walkRules(".messenger-shell.chat-list-view .chat-empty-action-pill", rule => {
    chatEmptyActionShadow = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "box-shadow"
    )?.value;
  });

  tabletLayout?.walkRules(".messenger-shell.has-active-chat .chat-detail-header--floating", rule => {
    chatHeaderMinHeight = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "min-height"
    )?.value;
    chatHeaderPadding = rule.nodes?.find(
      node => node.type === "decl" && node.prop === "padding"
    )?.value;
  });

  tabletLayout?.walkRules(rule => {
    if (rule.type !== "rule") return;
    if (rule.selector.includes(".chat-header-actions .icon-button")) {
      chatActionHeight = rule.nodes?.find(
        node => node.type === "decl" && node.prop === "height"
      )?.value;
    }
    if (rule.selector.includes(".chat-title-group .chat-avatar")) {
      chatAvatarHeight = rule.nodes?.find(
        node => node.type === "decl" && node.prop === "height"
      )?.value;
    }
  });

  expect(navGridColumn).toBe("1");
  expect(navWidth).toBe("var(--nav-rail-width)");
  expect(navActiveBackground).toBe("transparent");
  expect(navActiveRadius).toBe("0");
  expect(navActiveIndicatorContent).toBe('""');
  expect(navActiveIndicatorHeight).toBe("44px");
  expect(navActiveIndicatorWidth).toBe("44px");
  expect(pageGridColumn).toBe("2");
  expect(chatPaneColumns).toContain("minmax(260px, 300px)");
  expect(chatSidebarBackground).toBe("transparent");
  expect(chatSidebarBorder).toBe("0");
  expect(chatSidebarShadow).toBe("none");
  expect(chatSidebarHeaderBorder).toBe("0");
  expect(chatDetailBorder).toBe("0");
  expect(chatEmptyCardBorder).toBe("0");
  expect(chatEmptyCardBackground).toBe("transparent");
  expect(chatEmptyCardShadow).toBe("none");
  expect(chatEmptyIconBackground).toBe("transparent");
  expect(chatEmptyIconShadow).toBe("none");
  expect(chatEmptyActionShadow).toBe("none");
  expect(chatHeaderMinHeight).toBe("48px");
  expect(chatHeaderPadding).toBe("4px");
  expect(chatAvatarHeight).toBe("34px");
  expect(chatActionHeight).toBe("34px");
});
