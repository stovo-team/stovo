import { describe, expect, it } from "vitest";

import {
  isSafeMessageUrl,
  parseStovoMarkdown,
  type StovoMarkdownNode
} from "./messageMarkdown";

function text(value: string): StovoMarkdownNode {
  return { type: "text", value };
}

function collectNodes(
  nodes: StovoMarkdownNode[],
  type: StovoMarkdownNode["type"]
): StovoMarkdownNode[] {
  const matches: StovoMarkdownNode[] = [];
  for (const node of nodes) {
    if (node.type === type) matches.push(node);
    if (node.type !== "text") matches.push(...collectNodes(node.children, type));
  }
  return matches;
}

function sourceText(nodes: StovoMarkdownNode[]): string {
  return nodes
    .map((node) => (node.type === "text" ? node.value : sourceText(node.children)))
    .join("");
}

describe("parseStovoMarkdown", () => {
  it("returns no nodes for absent or empty source", () => {
    expect(parseStovoMarkdown(null)).toEqual([]);
    expect(parseStovoMarkdown(undefined)).toEqual([]);
    expect(parseStovoMarkdown("")).toEqual([]);
  });

  it("keeps a single ordinary character as one exact text node", () => {
    expect(parseStovoMarkdown("x")).toEqual([text("x")]);
  });

  it.each([
    ["**bold**", "bold"],
    ["_italic_", "italic"],
    ["__underline__", "underline"],
    ["~~strike~~", "strikethrough"],
    ["||secret||", "spoiler"]
  ] as const)("parses %s with the documented node type", (source, type) => {
    expect(parseStovoMarkdown(source)).toEqual([{ type, children: [text(source.replace(/^\*\*|\*\*$|^__|__$|^~~|~~$|^\|\||\|\|$|^_|_$/g, ""))] }]);
  });

  it("uses longest delimiter precedence and supports nesting plus adjacency", () => {
    expect(parseStovoMarkdown("**bold _and italic_**__under__~~gone~~")).toEqual([
      {
        type: "bold",
        children: [text("bold "), { type: "italic", children: [text("and italic")] }]
      },
      { type: "underline", children: [text("under")] },
      { type: "strikethrough", children: [text("gone")] }
    ]);
  });

  it.each([
    "before **after",
    "before _after",
    "before __after",
    "before ~~after",
    "before ||after",
    "****",
    "____",
    "~~~~",
    "||||"
  ])("keeps unmatched or empty delimiters literal: %s", (source) => {
    expect(parseStovoMarkdown(source)).toEqual([text(source)]);
  });

  it("keeps raw tags and entity-looking text inert", () => {
    const source = '<img src=x onerror=alert(1)> &lt;script&gt; **safe text**';
    const nodes = parseStovoMarkdown(source);

    expect(sourceText(nodes)).toBe('<img src=x onerror=alert(1)> &lt;script&gt; safe text');
    expect(collectNodes(nodes, "link")).toEqual([]);
    expect(collectNodes(nodes, "bold")).toHaveLength(1);
  });

  it("creates links for safe explicit and plain candidates without sentence punctuation", () => {
    expect(parseStovoMarkdown("[site](https://example.com/a) and http://example.com/x, mailto:me@example.com.")).toEqual([
      { type: "link", href: "https://example.com/a", children: [text("site")] },
      text(" and "),
      { type: "link", href: "http://example.com/x", children: [text("http://example.com/x")] },
      text(", "),
      { type: "link", href: "mailto:me@example.com", children: [text("mailto:me@example.com")] },
      text(".")
    ]);
  });

  it.each([
    "[x](javascript:alert(1))",
    "[x](data:text/html,boom)",
    "[x](vbscript:msgbox(1))",
    "[x](//example.com/path)",
    "[x](https://)",
    "[x](https://exa\u0000mple.com)"
  ])("leaves an unsafe or malformed explicit link literal: %s", (source) => {
    const nodes = parseStovoMarkdown(source);
    expect(collectNodes(nodes, "link")).toEqual([]);
    expect(sourceText(nodes)).toBe(source);
  });

  it("preserves normalization-distinct Unicode, graphemes, and line breaks exactly", () => {
    const samples = [
      "\u00e9",
      "e\u0301",
      "\ud83d\ude80",
      "\ud83d\udc4d\ud83c\udffd",
      "\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67\u200d\ud83d\udc66",
      "first\nsecond"
    ];

    for (const sample of samples) {
      expect(parseStovoMarkdown(sample)).toEqual([text(sample)]);
      expect(sourceText(parseStovoMarkdown(`**${sample}**`))).toBe(sample);
    }
    expect(sourceText(parseStovoMarkdown(samples[0]))).not.toBe(sourceText(parseStovoMarkdown(samples[1])));
  });

  it("emits syntax beyond 32 nested levels as literal text", () => {
    let source = "deep";
    for (let level = 0; level < 33; level += 1) {
      source = `[${source}](https://example.com/${level})`;
    }

    let nodes = parseStovoMarkdown(source);
    for (let level = 0; level < 32; level += 1) {
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe("link");
      nodes = nodes[0].type === "link" ? nodes[0].children : [];
    }
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("text");
    expect(nodes[0].type === "text" ? nodes[0].value : "").toContain("[deep]");
  });
});

describe("isSafeMessageUrl", () => {
  it.each([
    "http://example.com",
    "https://example.com/path?q=1",
    "mailto:family@example.com",
    "HTTPS://EXAMPLE.COM"
  ])("accepts an approved URL: %s", (candidate) => {
    expect(isSafeMessageUrl(candidate)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,boom",
    "vbscript:msgbox(1)",
    "//example.com/path",
    "https://",
    " https://example.com",
    "https://example.com\u0000.evil.test"
  ])("rejects an unsafe or malformed URL: %s", (candidate) => {
    expect(isSafeMessageUrl(candidate)).toBe(false);
  });
});
