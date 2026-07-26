import React, { Fragment, useState } from "react";

export type StovoMarkdownNode =
  | { type: "text"; value: string }
  | {
      type: "bold" | "italic" | "underline" | "strikethrough" | "spoiler" | "code" | "quote";
      children: StovoMarkdownNode[];
    }
  | { type: "link"; href: string; children: StovoMarkdownNode[] };

const maxNestingDepth = 32;

const formattingDelimiters = [
  { delimiter: "**", type: "bold" },
  { delimiter: "__", type: "underline" },
  { delimiter: "~~", type: "strikethrough" },
  { delimiter: "||", type: "spoiler" },
  { delimiter: "`", type: "code" },
  { delimiter: "*", type: "italic" },
  { delimiter: "_", type: "italic" }
] as const;

const plainLinkPrefixes = ["https://", "http://", "mailto:"];
const trailingLinkPunctuation = new Set([".", ",", "!", "?", ";", ":", ")", "]", "}"]);

function appendText(nodes: StovoMarkdownNode[], value: string): void {
  if (!value) return;
  const previous = nodes[nodes.length - 1];
  if (previous?.type === "text") {
    previous.value += value;
    return;
  }
  nodes.push({ type: "text", value });
}

function findMatchingBracket(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "[") depth += 1;
    if (source[index] !== "]") continue;
    depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function findMatchingParenthesis(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] !== ")") continue;
    depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

type ExplicitLinkMatch =
  | { kind: "link"; end: number; href: string; label: string }
  | { kind: "literal"; end: number; value: string };

function matchExplicitLink(source: string, start: number): ExplicitLinkMatch | null {
  if (source[start] !== "[") return null;
  const labelEnd = findMatchingBracket(source, start);
  if (labelEnd <= start + 1 || source[labelEnd + 1] !== "(") return null;

  const targetStart = labelEnd + 2;
  const targetEnd = findMatchingParenthesis(source, labelEnd + 1);
  if (targetEnd < 0) {
    return { kind: "literal", end: source.length, value: source.slice(start) };
  }

  const end = targetEnd + 1;
  const href = source.slice(targetStart, targetEnd);
  if (!isSafeMessageUrl(href)) {
    return { kind: "literal", end, value: source.slice(start, end) };
  }

  return {
    kind: "link",
    end,
    href,
    label: source.slice(start + 1, labelEnd)
  };
}

function matchPlainLink(source: string, start: number): { end: number; href: string } | null {
  const rest = source.slice(start).toLowerCase();
  if (!plainLinkPrefixes.some((prefix) => rest.startsWith(prefix))) return null;

  let candidateEnd = start;
  while (candidateEnd < source.length && !/[\s<>"']/.test(source[candidateEnd])) {
    candidateEnd += 1;
  }

  let hrefEnd = candidateEnd;
  while (hrefEnd > start && trailingLinkPunctuation.has(source[hrefEnd - 1])) {
    hrefEnd -= 1;
  }
  if (hrefEnd === start) return null;

  const href = source.slice(start, hrefEnd);
  if (!isSafeMessageUrl(href)) {
    return { end: candidateEnd, href: "" };
  }
  return { end: hrefEnd, href };
}

function parseInline(source: string, depth: number): StovoMarkdownNode[] {
  if (!source) return [];
  if (depth >= maxNestingDepth) return [{ type: "text", value: source }];

  const nodes: StovoMarkdownNode[] = [];
  let index = 0;

  while (index < source.length) {
    const explicitLink = matchExplicitLink(source, index);
    if (explicitLink) {
      if (explicitLink.kind === "literal") {
        appendText(nodes, explicitLink.value);
      } else {
        nodes.push({
          type: "link",
          href: explicitLink.href,
          children: parseInline(explicitLink.label, depth + 1)
        });
      }
      index = explicitLink.end;
      continue;
    }

    const plainLink = matchPlainLink(source, index);
    if (plainLink) {
      if (plainLink.href) {
        nodes.push({
          type: "link",
          href: plainLink.href,
          children: [{ type: "text", value: plainLink.href }]
        });
      } else {
        appendText(nodes, source.slice(index, plainLink.end));
      }
      index = plainLink.end;
      continue;
    }

    const format = formattingDelimiters.find(({ delimiter }) =>
      source.startsWith(delimiter, index)
    );
    if (format) {
      const contentStart = index + format.delimiter.length;
      const contentEnd = source.indexOf(format.delimiter, contentStart);
      if (contentEnd === contentStart) {
        appendText(nodes, format.delimiter + format.delimiter);
        index = contentEnd + format.delimiter.length;
        continue;
      }
      if (contentEnd > contentStart) {
        const inner = source.slice(contentStart, contentEnd);
        nodes.push({
          type: format.type,
          children:
            format.type === "code"
              ? [{ type: "text", value: inner }]
              : parseInline(inner, depth + 1)
        });
        index = contentEnd + format.delimiter.length;
        continue;
      }
      appendText(nodes, format.delimiter);
      index = contentStart;
      continue;
    }

    let textEnd = index + 1;
    while (
      textEnd < source.length &&
      source[textEnd] !== "[" &&
      !formattingDelimiters.some(({ delimiter }) => source.startsWith(delimiter, textEnd)) &&
      !plainLinkPrefixes.some((prefix) => source.slice(textEnd).toLowerCase().startsWith(prefix))
    ) {
      textEnd += 1;
    }
    appendText(nodes, source.slice(index, textEnd));
    index = textEnd;
  }

  return nodes;
}

export function parseStovoMarkdown(
  source: string | null | undefined
): StovoMarkdownNode[] {
  if (!source) return [];
  // Quote lines: lines starting with "> " become quote nodes (Telegram-style).
  if (source.includes("\n") || source.startsWith(">")) {
    const lines = source.split("\n");
    const nodes: StovoMarkdownNode[] = [];
    let quoteBuffer: string[] = [];
    const flushQuote = () => {
      if (quoteBuffer.length === 0) return;
      nodes.push({
        type: "quote",
        children: parseInline(quoteBuffer.join("\n"), 0)
      });
      quoteBuffer = [];
    };
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.startsWith("> ")) {
        quoteBuffer.push(line.slice(2));
        continue;
      }
      if (line === ">") {
        quoteBuffer.push("");
        continue;
      }
      flushQuote();
      if (nodes.length > 0 || i > 0) appendText(nodes, "\n");
      nodes.push(...parseInline(line, 0));
    }
    flushQuote();
    return nodes;
  }
  return parseInline(source, 0);
}

export function isSafeMessageUrl(candidate: string): boolean {
  if (!candidate || candidate !== candidate.trim()) return false;
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return false;

  try {
    const parsed = new URL(candidate);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:") {
      return /^https?:\/\//i.test(candidate) && Boolean(parsed.hostname);
    }
    if (protocol === "mailto:") {
      return /^mailto:[^?\s]+/i.test(candidate) && parsed.pathname.length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

export function MessageMarkdown(_props: {
  source: string | null | undefined;
}): React.ReactNode {
  return renderStovoMarkdownNodes(parseStovoMarkdown(_props.source));
}

type RenderContext = {
  suppressInteractions: boolean;
};

function containsInteractiveNode(nodes: StovoMarkdownNode[]): boolean {
  return nodes.some((node) => (
    node.type === "link" ||
    node.type === "spoiler" ||
    (node.type !== "text" && containsInteractiveNode(node.children))
  ));
}

function containsSpoiler(nodes: StovoMarkdownNode[]): boolean {
  return nodes.some((node) => (
    node.type === "spoiler" ||
    (node.type !== "text" && containsSpoiler(node.children))
  ));
}

function Spoiler({
  nodes,
  keyPrefix
}: {
  nodes: StovoMarkdownNode[];
  keyPrefix: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const hasInteractiveContent = containsInteractiveNode(nodes);

  if (revealed && hasInteractiveContent) {
    return (
      <span className="message-spoiler is-revealed">
        {renderNodes(nodes, keyPrefix, { suppressInteractions: false })}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`message-spoiler${revealed ? " is-revealed" : ""}`}
      aria-label="Reveal spoiler"
      aria-expanded={revealed}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        setRevealed((current) => !current);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        setRevealed((current) => !current);
      }}
    >
      {renderNodes(nodes, keyPrefix, { suppressInteractions: !revealed })}
    </button>
  );
}

function renderNodes(
  nodes: StovoMarkdownNode[],
  keyPrefix: string,
  context: RenderContext
): React.ReactNode {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") {
      return <Fragment key={key}>{node.value}</Fragment>;
    }

    const children = renderNodes(node.children, key, context);
    switch (node.type) {
      case "bold":
        return <strong key={key}>{children}</strong>;
      case "italic":
        return <em key={key}>{children}</em>;
      case "underline":
        return <u key={key}>{children}</u>;
      case "strikethrough":
        return <s key={key}>{children}</s>;
      case "code":
        return <code key={key} className="message-inline-code">{children}</code>;
      case "quote":
        return <blockquote key={key} className="message-quote">{children}</blockquote>;
      case "spoiler":
        if (context.suppressInteractions) {
          return <span key={key} className="message-spoiler-content">{children}</span>;
        }
        return <Spoiler key={key} nodes={node.children} keyPrefix={key} />;
      case "link":
        if (context.suppressInteractions || containsSpoiler(node.children)) {
          return <span key={key} className="message-link-text">{children}</span>;
        }
        return (
          <a key={key} href={node.href} rel="noopener noreferrer">
            {children}
          </a>
        );
    }
  });
}

export function renderStovoMarkdownNodes(
  nodes: StovoMarkdownNode[]
): React.ReactNode {
  return renderNodes(nodes, "message", { suppressInteractions: false });
}
