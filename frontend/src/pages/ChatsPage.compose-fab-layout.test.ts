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
      if (!rule.selector.endsWith(".messenger-shell.chat-list-view .compose-fab")) return;
      position = rule.nodes?.find(node => node.type === "decl" && node.prop === "position")?.value;
      right = rule.nodes?.find(node => node.type === "decl" && node.prop === "right")?.value;
    });

    expect(position).toBe("absolute");
    expect(right).toBe("12px");
  });
});
