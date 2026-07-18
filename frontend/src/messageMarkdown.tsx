import type React from "react";

export type StovoMarkdownNode =
  | { type: "text"; value: string }
  | {
      type: "bold" | "italic" | "underline" | "strikethrough" | "spoiler";
      children: StovoMarkdownNode[];
    }
  | { type: "link"; href: string; children: StovoMarkdownNode[] };

export function parseStovoMarkdown(
  _source: string | null | undefined
): StovoMarkdownNode[] {
  return [];
}

export function isSafeMessageUrl(_candidate: string): boolean {
  return false;
}

export function MessageMarkdown(_props: {
  source: string | null | undefined;
}): React.ReactNode {
  return null;
}
