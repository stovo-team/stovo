import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppStrings } from "./config/strings";
// @ts-ignore Vitest supplies Node built-ins while the browser app omits Node typings.
import { readFileSync } from "node:fs";

import {
  isSafeMessageUrl,
  MessageMarkdown,
  parseStovoMarkdown,
  renderStovoMarkdownNodes,
  type StovoMarkdownNode
} from "./messageMarkdown";

vi.mock("./i18n/LanguageContext", () => ({ useStrings: () => getAppStrings("ru") }));

// @ts-ignore Vitest runs from the frontend project root.
const messageStyles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

const mountedRoots: Root[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function renderMessage(
  source: string | null | undefined,
  parentHandlers: {
    onClick?: () => void;
    onPointerDown?: () => void;
    onKeyDown?: () => void;
  } = {}
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <div {...parentHandlers}>
        <MessageMarkdown source={source} />
      </div>
    );
  });
  return container;
}

function renderMessageBubble(
  source: string,
  parentHandlers: { onClick?: () => void } = {}
): HTMLDivElement {
  const concealmentStart = messageStyles.indexOf(
    ".message-bubble p .message-spoiler:not(.is-revealed)"
  );
  const concealmentEnd = messageStyles.indexOf(
    "span.message-spoiler.is-revealed",
    concealmentStart
  );
  expect(concealmentStart).toBeGreaterThanOrEqual(0);
  expect(concealmentEnd).toBeGreaterThan(concealmentStart);
  const style = document.createElement("style");
  style.dataset.messageMarkdownTestStyles = "true";
  style.textContent = messageStyles.slice(concealmentStart, concealmentEnd);
  document.head.appendChild(style);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <div className="message-bubble" {...parentHandlers}>
        <p><MessageMarkdown source={source} /></p>
      </div>
    );
  });
  return container;
}

function renderNodeTree(nodes: StovoMarkdownNode[]): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <div className="message-bubble">
        <p>{renderStovoMarkdownNodes(nodes)}</p>
      </div>
    );
  });
  return container;
}

afterEach(() => {
  if (typeof document === "undefined") return;
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => root?.unmount());
  }
  document.body.replaceChildren();
  document.head.querySelectorAll("[data-message-markdown-test-styles]")
    .forEach((style) => style.remove());
});

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

  it("auto-links international phone numbers starting with + and strips formatting for tel: href", () => {
    expect(parseStovoMarkdown("Call +1234567890 or +7 999 123-45-67, also +1 (555) 123-4567.")).toEqual([
      text("Call "),
      { type: "link", href: "tel:+1234567890", children: [text("+1234567890")] },
      text(" or "),
      { type: "link", href: "tel:+79991234567", children: [text("+7 999 123-45-67")] },
      text(", also "),
      { type: "link", href: "tel:+15551234567", children: [text("+1 (555) 123-4567")] },
      text(".")
    ]);
  });

  it("leaves numbers without + or with invalid digit counts literal", () => {
    expect(parseStovoMarkdown("Call 88005553535 or 123456 or 1+2 or +1 or +1234567890123456")).toEqual([
      text("Call 88005553535 or 123456 or 1+2 or +1 or +1234567890123456")
    ]);
  });

  it("auto-links plain email addresses without mailto prefix and excludes sentence punctuation", () => {
    expect(parseStovoMarkdown("Contact alice@example.com or bob.smith+work@sub.domain.co.uk.")).toEqual([
      text("Contact "),
      { type: "link", href: "mailto:alice@example.com", children: [text("alice@example.com")] },
      text(" or "),
      { type: "link", href: "mailto:bob.smith+work@sub.domain.co.uk", children: [text("bob.smith+work@sub.domain.co.uk")] },
      text(".")
    ]);
  });

  it("distinguishes between @username mentions and emails", () => {
    expect(parseStovoMarkdown("Hey @alex, send details to alex@example.com!")).toEqual([
      text("Hey "),
      { type: "mention", username: "alex", children: [text("@alex")] },
      text(", send details to "),
      { type: "link", href: "mailto:alex@example.com", children: [text("alex@example.com")] },
      text("!")
    ]);
  });

  it("auto-links website-looking domains (something.domain) without protocol prefix", () => {
    expect(parseStovoMarkdown("Visit stovo.ru, something.domain/path?q=1, and www.google.com.")).toEqual([
      text("Visit "),
      { type: "link", href: "https://stovo.ru", children: [text("stovo.ru")] },
      text(", "),
      { type: "link", href: "https://something.domain/path?q=1", children: [text("something.domain/path?q=1")] },
      text(", and "),
      { type: "link", href: "https://www.google.com", children: [text("www.google.com")] },
      text(".")
    ]);
  });

  it("does not treat missing sentence spaces like cats.They as a domain", () => {
    expect(parseStovoMarkdown("I like cats.They are cute.")).toEqual([
      text("I like cats.They are cute.")
    ]);
  });
});

describe("isSafeMessageUrl", () => {
  it.each([
    "http://example.com",
    "https://example.com/path?q=1",
    "mailto:family@example.com",
    "HTTPS://EXAMPLE.COM",
    "tel:+1234567890",
    "tel:+79991234567",
    "tel:+1-555-123-4567",
    "TEL:+1234567890"
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
    "https://example.com\u0000.evil.test",
    "tel:1234567890",
    "tel:+123",
    "tel:+1234567890123456",
    "tel:javascript:alert(1)"
  ])("rejects an unsafe or malformed URL: %s", (candidate) => {
    expect(isSafeMessageUrl(candidate)).toBe(false);
  });
});

describe("MessageMarkdown", () => {
  it("conceals a spoiler-wrapped link without nested interactive DOM, then reveals one safe anchor", () => {
    const onClick = vi.fn();
    const container = renderMessageBubble(
      "||[family](https://example.com/family)||",
      { onClick }
    );
    const spoiler = container.querySelector("button.message-spoiler");
    const concealedLinkText = spoiler?.querySelector(".message-link-text");

    expect(spoiler).not.toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(spoiler?.querySelector("a, button")).toBeNull();
    expect(getComputedStyle(concealedLinkText as Element).color).toBe("rgba(0, 0, 0, 0)");

    act(() => {
      spoiler?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const revealed = container.querySelector(".message-spoiler.is-revealed");
    const anchor = revealed?.querySelector("a");
    expect(revealed?.tagName.toLowerCase()).toBe("span");
    expect(container.querySelector("button")).toBeNull();
    expect(anchor?.getAttribute("href")).toBe("https://example.com/family");
    expect(revealed?.querySelector("button")).toBeNull();
    expect(getComputedStyle(anchor as Element).color).not.toBe("rgba(0, 0, 0, 0)");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("suppresses an outer link when its label contains a spoiler", () => {
    const onClick = vi.fn();
    const container = renderMessage(
      "[before ||secret|| after](https://example.com/path)",
      { onClick }
    );
    const spoiler = container.querySelector("button.message-spoiler");

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector(".message-link-text")?.textContent).toBe("before secret after");
    expect(container.querySelector("a button, button a")).toBeNull();

    act(() => {
      spoiler?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(spoiler?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("a")).toBeNull();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("never nests spoiler buttons while revealing a nested spoiler tree", () => {
    const container = renderNodeTree([{
      type: "spoiler",
      children: [
        text("outer "),
        { type: "spoiler", children: [text("inner")] }
      ]
    }]);
    const outer = container.querySelector("button.message-spoiler");

    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector("button button")).toBeNull();
    act(() => outer?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const inner = container.querySelector("button.message-spoiler");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector("button button")).toBeNull();
    expect(container.querySelector(".message-spoiler.is-revealed")?.tagName.toLowerCase()).toBe("span");

    act(() => inner?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector("button button")).toBeNull();
  });

  it("renders all formats as semantic inline elements while preserving literal text and lines", () => {
    const container = renderMessage(
      "before\n**bold** _italic_ __under__ ~~strike~~ ||secret||\nafter"
    );

    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("u")?.textContent).toBe("under");
    expect(container.querySelector("s")?.textContent).toBe("strike");
    expect(container.querySelector("button")?.textContent).toBe("secret");
    expect(container.textContent).toBe("before\nbold italic under strike secret\nafter");
  });

  it("renders approved anchors with protective rel attributes and leaves rejected links inert", () => {
    const safe = renderMessage(
      "[site](https://example.com/path) mailto:family@example.com"
    );
    const anchors = [...safe.querySelectorAll("a")];
    expect(anchors).toHaveLength(2);
    expect(anchors[0].getAttribute("href")).toBe("https://example.com/path");
    expect(anchors[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchors[1].getAttribute("href")).toBe("mailto:family@example.com");
    expect(anchors[1].getAttribute("rel")).toBe("noopener noreferrer");

    const unsafe = renderMessage("[run](javascript:alert(1))");
    expect(unsafe.querySelector("a")).toBeNull();
    expect(unsafe.textContent).toBe("[run](javascript:alert(1))");
  });

  it.each(["x", "\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67\u200d\ud83d\udc66"])(
    "conceals and reveals a spoiler containing %s",
    (content) => {
      const container = renderMessage(`||${content}||`);
      const spoiler = container.querySelector("button");

      expect(spoiler).not.toBeNull();
      expect(spoiler?.getAttribute("aria-label")).toBe("Показать скрытый текст");
      expect(spoiler?.getAttribute("aria-expanded")).toBe("false");
      expect(spoiler?.classList.contains("is-revealed")).toBe(false);

      act(() => {
        spoiler?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(spoiler?.getAttribute("aria-expanded")).toBe("true");
      expect(spoiler?.classList.contains("is-revealed")).toBe(true);
      expect(spoiler?.textContent).toBe(content);
    }
  );

  it("renders and reveals nested formatted spoiler content", () => {
    const container = renderMessage("||one **two** _three_||");
    const spoiler = container.querySelector("button");
    expect(spoiler?.querySelector("strong")?.textContent).toBe("two");
    expect(spoiler?.querySelector("em")?.textContent).toBe("three");

    act(() => {
      spoiler?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(spoiler?.getAttribute("aria-expanded")).toBe("true");
  });

  it("stops pointer and click propagation when revealing a spoiler", () => {
    const onClick = vi.fn();
    const onPointerDown = vi.fn();
    const container = renderMessage("||secret||", { onClick, onPointerDown });
    const spoiler = container.querySelector("button");

    act(() => {
      spoiler?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      spoiler?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(spoiler?.getAttribute("aria-expanded")).toBe("true");
  });

  it.each(["Enter", " "])(
    "reveals with the %s key without bubbling to message handlers",
    (key) => {
      const onKeyDown = vi.fn();
      const container = renderMessage("||secret||", { onKeyDown });
      const spoiler = container.querySelector("button");

      act(() => {
        spoiler?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });

      expect(onKeyDown).not.toHaveBeenCalled();
      expect(spoiler?.getAttribute("aria-expanded")).toBe("true");
    }
  );

  it("adds no wrapper or interactive control for null and empty source", () => {
    const absent = renderMessage(null);
    const empty = renderMessage("");

    expect(absent.firstElementChild?.childNodes).toHaveLength(0);
    expect(empty.firstElementChild?.childNodes).toHaveLength(0);
    expect(document.querySelector("button")).toBeNull();
  });

  it("renders plain, emoji-only, normalization-distinct, and legacy multiline text exactly", () => {
    const samples = [
      "x",
      "\ud83d\udc4d\ud83c\udffd",
      "\u00e9",
      "e\u0301",
      "legacy\nmessage"
    ];

    for (const sample of samples) {
      expect(renderMessage(sample).textContent).toBe(sample);
    }
  });

  it("keeps raw HTML and rejected links inert beside legacy reply, emoji, and single-character text", () => {
    const onClick = vi.fn();
    const onPointerDown = vi.fn();
    const onKeyDown = vi.fn();
    const replyStyle = "> earlier note";
    const source =
      `${replyStyle}\n` +
      `<script>alert(1)</script> [run](javascript:alert(1))\n` +
      `x\n` +
      `\ud83d\ude80 family`;

    const container = renderMessage(source, { onClick, onPointerDown, onKeyDown });

    expect(container.querySelector("script, img, a")).toBeNull();
    expect(container.textContent).toBe(source);
    expect(parseStovoMarkdown(source).every((node) =>
      node.type === "text" ||
      (node.type !== "link" && sourceText([node]).length >= 0)
    )).toBe(true);
    expect(collectNodes(parseStovoMarkdown(source), "link")).toEqual([]);
    expect(container.textContent).toContain(replyStyle);
    expect(container.textContent).toContain("x");
    expect(container.textContent).toContain("\ud83d\ude80 family");
    expect(onClick).not.toHaveBeenCalled();
    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("keeps canonical Markdown available for editing while spoilers stay isolated until explicit activation", () => {
    const canonical = "reply **bold** _italic_ ||opaque-id-7f3a||";
    const onClick = vi.fn();
    const onPointerDown = vi.fn();
    const onKeyDown = vi.fn();
    const container = renderMessage(canonical, { onClick, onPointerDown, onKeyDown });
    const spoiler = container.querySelector("button.message-spoiler");

    expect(sourceText(parseStovoMarkdown(canonical))).toBe("reply bold italic opaque-id-7f3a");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(spoiler?.getAttribute("aria-label")).toBe("Показать скрытый текст");
    expect(spoiler?.getAttribute("aria-expanded")).toBe("false");
    expect(spoiler?.classList.contains("is-revealed")).toBe(false);

    act(() => {
      spoiler?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      spoiler?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(spoiler?.getAttribute("aria-expanded")).toBe("true");
    expect(onClick).not.toHaveBeenCalled();
    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(canonical).toContain("||opaque-id-7f3a||");
  });

  it("parses headings and bullet/numbered lists as block nodes", () => {
    expect(parseStovoMarkdown("# Title\n## Sub")).toEqual([
      { type: "heading", level: 1, children: [text("Title")] },
      { type: "heading", level: 2, children: [text("Sub")] }
    ]);
    expect(parseStovoMarkdown("- one\n- two")).toEqual([
      {
        type: "list",
        ordered: false,
        children: [
          { type: "listItem", children: [text("one")] },
          { type: "listItem", children: [text("two")] }
        ]
      }
    ]);
    expect(parseStovoMarkdown("1. alpha\n2. beta")).toEqual([
      {
        type: "list",
        ordered: true,
        children: [
          { type: "listItem", children: [text("alpha")] },
          { type: "listItem", children: [text("beta")] }
        ]
      }
    ]);

    const container = renderMessage("# Hello\n- item");
    expect(container.querySelector("h1")?.textContent).toBe("Hello");
    expect(container.querySelector("ul li")?.textContent).toBe("item");
  });

  it("renders the tail of a full-length Markdown document", () => {
    const source = Array.from(
      { length: 10_000 },
      (_, index) => `Section ${index}: ordinary document text with no special syntax.`,
    ).join("\n");
    const rendered = renderToStaticMarkup(<MessageMarkdown source={source} />);

    expect(rendered.match(/Section \d+:/g)).toHaveLength(10_000);
    expect(rendered).toContain("Section 9999: ordinary document text with no special syntax.");
  });

  it("parses and renders @user mentions correctly", () => {
    const nodes = parseStovoMarkdown("Hello @alex and @jane_doe! Also @bob.");
    expect(nodes).toEqual([
      text("Hello "),
      { type: "mention", username: "alex", children: [text("@alex")] },
      text(" and "),
      { type: "mention", username: "jane_doe", children: [text("@jane_doe")] },
      text("! Also "),
      { type: "mention", username: "bob", children: [text("@bob")] },
      text(".")
    ]);

    const container = renderMessage("Hey @alex check this out");
    const mention = container.querySelector(".message-mention");
    expect(mention).not.toBeNull();
    expect(mention?.textContent).toBe("@alex");
    expect(mention?.getAttribute("data-username")).toBe("alex");
  });

  it("parses and renders interactive task lists (- [ ] and - [x])", () => {
    const source = "- [ ] Buy groceries\n- [x] Pick up laundry";
    const nodes = parseStovoMarkdown(source);
    expect(nodes).toEqual([
      {
        type: "list",
        ordered: false,
        children: [
          { type: "listItem", checked: false, children: [text("Buy groceries")] },
          { type: "listItem", checked: true, children: [text("Pick up laundry")] }
        ]
      }
    ]);

    const container = renderMessage(source);
    const taskItems = container.querySelectorAll(".message-task-item");
    expect(taskItems).toHaveLength(2);
    expect(taskItems[0].classList.contains("is-checked")).toBe(false);
    expect(taskItems[1].classList.contains("is-checked")).toBe(true);

    const checkboxes = container.querySelectorAll<HTMLInputElement>(".message-task-checkbox input");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);
  });

  it("renders phone, email, and web domain anchors with appropriate target and attributes", () => {
    const onClick = vi.fn();
    const container = renderMessage(
      "Call +1 (555) 123-4567, email test@example.com, visit stovo.ru",
      { onClick }
    );
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors).toHaveLength(3);

    // Phone link: tel:+15551234567, no target=_blank
    expect(anchors[0].getAttribute("href")).toBe("tel:+15551234567");
    expect(anchors[0].getAttribute("target")).toBeNull();
    expect(anchors[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchors[0].textContent).toBe("+1 (555) 123-4567");

    // Email link: mailto:test@example.com, no target=_blank
    expect(anchors[1].getAttribute("href")).toBe("mailto:test@example.com");
    expect(anchors[1].getAttribute("target")).toBeNull();
    expect(anchors[1].getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchors[1].textContent).toBe("test@example.com");

    // Web domain link: https://stovo.ru, target=_blank
    expect(anchors[2].getAttribute("href")).toBe("https://stovo.ru");
    expect(anchors[2].getAttribute("target")).toBe("_blank");
    expect(anchors[2].getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchors[2].textContent).toBe("stovo.ru");

    // Clicking an anchor stops propagation to parent bubble handlers
    act(() => {
      anchors[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("supports phone and email links inside inline formatting and spoilers", () => {
    const container = renderMessage(
      "**+1234567890** and _user@example.com_ and ||stovo.ru||"
    );
    expect(container.querySelector("strong a")?.getAttribute("href")).toBe("tel:+1234567890");
    expect(container.querySelector("em a")?.getAttribute("href")).toBe("mailto:user@example.com");

    // Spoiler conceals web link initially
    const spoiler = container.querySelector("button.message-spoiler");
    expect(spoiler).not.toBeNull();
    act(() => {
      spoiler?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("span.message-spoiler.is-revealed a")?.getAttribute("href")).toBe("https://stovo.ru");
  });
});
