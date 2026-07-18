import type React from "react";

export type StovoMarkdownNode =
  | { type: "text"; value: string }
  | {
      type: "bold" | "italic" | "underline" | "strikethrough" | "spoiler";
      children: StovoMarkdownNode[];
    }
  | { type: "link"; href: string; children: StovoMarkdownNode[] };

const maxNestingDepth = 32;

const formattingDelimiters = [
  { delimiter: "**", type: "bold" },
  { delimiter: "__", type: "underline" },
  { delimiter: "~~", type: "strikethrough" },
  { delimiter: "||", type: "spoiler" },
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
        nodes.push({
          type: format.type,
          children: parseInline(source.slice(contentStart, contentEnd), depth + 1)
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
  return source ? parseInline(source, 0) : [];
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
  return null;
}
