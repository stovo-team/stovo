import React, { Fragment, useState } from "react";

export type StovoMarkdownNode =
  | { type: "text"; value: string }
  | {
      type:
        | "bold"
        | "italic"
        | "underline"
        | "strikethrough"
        | "spoiler"
        | "code"
        | "quote"
        | "heading"
        | "list"
        | "listItem"
        | "paragraph";
      children: StovoMarkdownNode[];
      level?: number;
      ordered?: boolean;
      checked?: boolean;
    }
  | { type: "link"; href: string; children: StovoMarkdownNode[] }
  | { type: "mention"; username: string; children: StovoMarkdownNode[] };

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

function isBoundary(char: string | undefined): boolean {
  return !char || /[\s([{"'<>]/.test(char);
}

const phoneRegex = /^\+(?:\([0-9]+\)\s*|[0-9]+)(?:(?:\s*[-.]\s*|\s+|\s*\([0-9]+\)\s*)[0-9]+)*/;

function matchPhoneLink(
  source: string,
  start: number
): { end: number; href: string; text: string } | null {
  if (source[start] !== "+") return null;
  if (start > 0 && !isBoundary(source[start - 1])) return null;

  const rest = source.slice(start);
  const match = phoneRegex.exec(rest);
  if (!match) return null;

  const candidate = match[0];
  const digits = candidate.replace(/[^0-9]/g, "");
  if (digits.length < 5 || digits.length > 15) return null;

  const nextChar = rest.slice(candidate.length, candidate.length + 1);
  if (nextChar && /[a-zA-Z0-9]/.test(nextChar)) return null;

  const href = `tel:+${digits}`;
  if (!isSafeMessageUrl(href)) return null;

  return {
    end: start + candidate.length,
    href,
    text: candidate
  };
}

const emailRegex = /^[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/;

function matchEmailLink(
  source: string,
  start: number
): { end: number; href: string; text: string } | null {
  if (start > 0 && !isBoundary(source[start - 1])) return null;

  const rest = source.slice(start);
  const match = emailRegex.exec(rest);
  if (!match) return null;

  let candidate = match[0];
  let end = start + candidate.length;

  while (candidate.length > 0 && trailingLinkPunctuation.has(candidate[candidate.length - 1])) {
    candidate = candidate.slice(0, -1);
    end -= 1;
  }
  if (!candidate) return null;

  const atIndex = candidate.indexOf("@");
  if (atIndex <= 0) return null;
  const domain = candidate.slice(atIndex + 1);
  const lastDot = domain.lastIndexOf(".");
  if (lastDot < 0) return null;
  const tld = domain.slice(lastDot + 1);
  if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return null;

  const href = `mailto:${candidate}`;
  if (!isSafeMessageUrl(href)) return null;

  return { end, href, text: candidate };
}

const webDomainRegex = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)(?::[0-9]+)?(\/[^\s<>"']*)?/;

function matchWebDomainLink(
  source: string,
  start: number
): { end: number; href: string; text: string } | null {
  if (start > 0 && !isBoundary(source[start - 1])) return null;

  const rest = source.slice(start);
  const match = webDomainRegex.exec(rest);
  if (!match) return null;

  let candidate = match[0];
  let end = start + candidate.length;

  while (candidate.length > 0 && trailingLinkPunctuation.has(candidate[candidate.length - 1])) {
    candidate = candidate.slice(0, -1);
    end -= 1;
  }
  if (!candidate) return null;

  const hostname = match[1];
  const lastDot = hostname.lastIndexOf(".");
  if (lastDot < 0) return null;
  const tld = hostname.slice(lastDot + 1);
  if (!/^[a-zA-Z]{2,24}$/.test(tld)) return null;

  const hasPath = Boolean(match[2]);
  const isWww = hostname.toLowerCase().startsWith("www.");
  if (!hasPath && !isWww) {
    if (/^[A-Z][a-z]+$/.test(tld) && /^[a-z]+$/.test(hostname.slice(0, lastDot))) {
      return null;
    }
  }

  const href = `https://${candidate}`;
  if (!isSafeMessageUrl(href)) return null;

  return { end, href, text: candidate };
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

function matchMention(source: string, start: number): { end: number; username: string } | null {
  if (source[start] !== "@") return null;
  if (start > 0 && !isBoundary(source[start - 1])) return null;

  const rest = source.slice(start);
  const match = /^@([\p{L}\p{N}_.-]+)/u.exec(rest);
  if (!match) return null;

  let username = match[1];
  let end = start + 1 + username.length;

  while (username.length > 0 && trailingLinkPunctuation.has(username[username.length - 1])) {
    username = username.slice(0, -1);
    end -= 1;
  }
  if (!username) return null;

  return { end, username };
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

    const emailLink = matchEmailLink(source, index);
    if (emailLink) {
      nodes.push({
        type: "link",
        href: emailLink.href,
        children: [{ type: "text", value: emailLink.text }]
      });
      index = emailLink.end;
      continue;
    }

    const webDomainLink = matchWebDomainLink(source, index);
    if (webDomainLink) {
      nodes.push({
        type: "link",
        href: webDomainLink.href,
        children: [{ type: "text", value: webDomainLink.text }]
      });
      index = webDomainLink.end;
      continue;
    }

    const phoneLink = matchPhoneLink(source, index);
    if (phoneLink) {
      nodes.push({
        type: "link",
        href: phoneLink.href,
        children: [{ type: "text", value: phoneLink.text }]
      });
      index = phoneLink.end;
      continue;
    }

    const mention = matchMention(source, index);
    if (mention) {
      nodes.push({
        type: "mention",
        username: mention.username,
        children: [{ type: "text", value: `@${mention.username}` }]
      });
      index = mention.end;
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
      (source[textEnd] !== "@" || !isBoundary(source[textEnd - 1])) &&
      (source[textEnd] !== "+" || !isBoundary(source[textEnd - 1])) &&
      !isBoundary(source[textEnd - 1]) &&
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

type BlockLine =
  | { kind: "heading"; level: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "ul"; text: string }
  | { kind: "task"; checked: boolean; text: string }
  | { kind: "ol"; text: string }
  | { kind: "empty" }
  | { kind: "paragraph"; text: string };

function classifyLine(line: string): BlockLine {
  const heading = /^(#{1,6})\s+(.+)$/.exec(line);
  if (heading) {
    return { kind: "heading", level: heading[1].length, text: heading[2] };
  }
  if (line.startsWith("> ")) {
    return { kind: "quote", text: line.slice(2) };
  }
  if (line === ">") {
    return { kind: "quote", text: "" };
  }
  const unordered = /^[-*+]\s+(.*)$/.exec(line);
  if (unordered) {
    const text = unordered[1];
    const taskMatch = /^\[([ xX])\]\s*(.*)$/.exec(text);
    if (taskMatch) {
      return { kind: "task", checked: taskMatch[1].toLowerCase() === "x", text: taskMatch[2] };
    }
    return { kind: "ul", text };
  }
  const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
  if (ordered) {
    return { kind: "ol", text: ordered[1] };
  }
  if (line.trim() === "") {
    return { kind: "empty" };
  }
  return { kind: "paragraph", text: line };
}

export function parseStovoMarkdown(
  source: string | null | undefined
): StovoMarkdownNode[] {
  if (!source) return [];

  // Never reinterpret a potentially unsafe mixed payload as block Markdown.
  // Keeping it literal preserves the sender's text and prevents markup-like
  // fragments from changing the surrounding message structure.
  if (
    source.includes("\n") &&
    (/<\/?[a-z][^>]*>/i.test(source) || /\]\(\s*javascript:/i.test(source))
  ) {
    return [{ type: "text", value: source }];
  }

  const lines = source.split("\n");
  const hasBlockMarkup = lines.some((line) => {
    const kind = classifyLine(line).kind;
    return kind === "heading" || kind === "ul" || kind === "task" || kind === "ol" || kind === "quote";
  });

  // Preserve legacy inline-only messages (including plain newlines) exactly.
  if (!hasBlockMarkup) {
    return parseInline(source, 0);
  }

  const nodes: StovoMarkdownNode[] = [];
  let quoteBuffer: string[] = [];
  let listBuffer: { ordered: boolean; items: { text: string; checked?: boolean }[] } | null = null;
  let paragraphBuffer: string[] = [];

  const flushQuote = () => {
    if (quoteBuffer.length === 0) return;
    nodes.push({
      type: "quote",
      children: parseInline(quoteBuffer.join("\n"), 0)
    });
    quoteBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer || listBuffer.items.length === 0) {
      listBuffer = null;
      return;
    }
    nodes.push({
      type: "list",
      ordered: listBuffer.ordered,
      children: listBuffer.items.map((item) => ({
        type: "listItem" as const,
        checked: item.checked,
        children: parseInline(item.text, 0)
      }))
    });
    listBuffer = null;
  };

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join("\n");
    nodes.push({
      type: "paragraph",
      children: parseInline(text, 0)
    });
    paragraphBuffer = [];
  };

  const flushBlocks = () => {
    flushQuote();
    flushList();
    flushParagraph();
  };

  for (const line of lines) {
    const classified = classifyLine(line);

    if (classified.kind === "quote") {
      flushList();
      flushParagraph();
      quoteBuffer.push(classified.text);
      continue;
    }

    if (classified.kind === "ul" || classified.kind === "ol" || classified.kind === "task") {
      flushQuote();
      flushParagraph();
      const ordered = classified.kind === "ol";
      if (!listBuffer || listBuffer.ordered !== ordered) {
        flushList();
        listBuffer = { ordered, items: [] };
      }
      listBuffer.items.push({
        text: classified.text,
        checked: classified.kind === "task" ? classified.checked : undefined
      });
      continue;
    }

    if (classified.kind === "heading") {
      flushBlocks();
      nodes.push({
        type: "heading",
        level: classified.level,
        children: parseInline(classified.text, 0)
      });
      continue;
    }

    if (classified.kind === "empty") {
      flushBlocks();
      continue;
    }

    flushQuote();
    flushList();
    paragraphBuffer.push(classified.text);
  }

  flushBlocks();
  return nodes;
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
    if (protocol === "tel:") {
      const cleaned = candidate.replace(/[-. ()]/g, "");
      return /^tel:\+[0-9]{4,15}$/i.test(cleaned);
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
      case "heading": {
        const level = Math.min(Math.max(node.level ?? 1, 1), 6);
        const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
        return (
          <Tag key={key} className={`message-heading message-heading-${level}`}>
            {children}
          </Tag>
        );
      }
      case "list":
        return node.ordered ? (
          <ol key={key} className="message-list message-list-ordered">{children}</ol>
        ) : (
          <ul key={key} className="message-list message-list-unordered">{children}</ul>
        );
      case "listItem": {
        if (typeof node.checked === "boolean") {
          return (
            <li key={key} className={`message-list-item message-task-item${node.checked ? " is-checked" : ""}`}>
              <span className={`message-task-checkbox${node.checked ? " checked" : ""}`} aria-hidden="true">
                <input type="checkbox" readOnly checked={node.checked} tabIndex={-1} />
              </span>
              <span className={`message-task-text${node.checked ? " is-completed" : ""}`}>{children}</span>
            </li>
          );
        }
        return <li key={key} className="message-list-item">{children}</li>;
      }
      case "paragraph":
        return (
          <span key={key} className="message-paragraph">
            {children}
          </span>
        );
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
          <a
            key={key}
            href={node.href}
            rel="noopener noreferrer"
            {...(/^https?:\/\//i.test(node.href) ? { target: "_blank" } : {})}
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </a>
        );
      case "mention":
        return (
          <span key={key} className="message-mention" data-username={node.username}>
            {children}
          </span>
        );
    }
  });
}

export function renderStovoMarkdownNodes(
  nodes: StovoMarkdownNode[]
): React.ReactNode {
  return renderNodes(nodes, "message", { suppressInteractions: false });
}
