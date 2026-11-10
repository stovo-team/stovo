import { readCssSource } from "../test/cssSource";
import { resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = parse(readCssSource(resolve(process.cwd(), "src/styles.css")));

describe("chat-list new-chat button layout", () => {
  it("anchors the narrow-screen new-chat button to the chat-list panel", () => {
    let position: string | undefined;
    let right: string | undefined;

    stylesheet.walkRules(rule => {
      if (rule.parent?.type === "atrule" || !rule.selector.includes(".messenger-shell.chat-list-view .compose-fab")) return;
      position = rule.nodes?.find(node => node.type === "decl" && node.prop === "position")?.value;
      right = rule.nodes?.find(node => node.type === "decl" && node.prop === "right")?.value;
    });

    expect(position).toBe("absolute");
    expect(right).toBe("12px");
  });

  it("increases the mobile create-new-chat button size without changing desktop sizing", () => {
    let mobileSize: { height?: string; width?: string; borderRadius?: string } = {};

    stylesheet.walkAtRules("media", media => {
      if (media.params !== "(max-width: 767px)") return;
      media.walkRules(rule => {
        if (!rule.selector.includes(".compose-fab")) return;
        mobileSize = {
          height: rule.nodes?.find(node => node.type === "decl" && node.prop === "height")?.value,
          width: rule.nodes?.find(node => node.type === "decl" && node.prop === "width")?.value,
          borderRadius: rule.nodes?.find(node => node.type === "decl" && node.prop === "border-radius")?.value,
        };
      });
    });

    expect(mobileSize).toEqual({ height: "48px", width: "48px", borderRadius: "var(--radius-circle)" });
    let desktopSize: string | undefined;
    stylesheet.walkRules(rule => {
      if (rule.parent?.type === "atrule" || rule.selector !== ".compose-fab") return;
      desktopSize = rule.nodes?.find(node => node.type === "decl" && node.prop === "width")?.value;
    });
    expect(desktopSize).toBe("40px");
  });
});
