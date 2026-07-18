export type FormattingKind = "bold" | "italic" | "underline" | "strikethrough" | "spoiler";

export type TextSelection = {
  start: number;
  end: number;
};

export type FormattingEdit = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  changed: boolean;
  replaceStart: number;
  replaceEnd: number;
  replacement: string;
};

export type ToolbarAnchor = {
  left: number;
  top: number;
};

export const formattingDelimiters: Record<FormattingKind, string> = {
  bold: "**",
  italic: "_",
  underline: "__",
  strikethrough: "~~",
  spoiler: "||"
};

function clampOffset(offset: number, length: number): number {
  if (Number.isNaN(offset)) return 0;
  if (offset === Number.POSITIVE_INFINITY) return length;
  if (offset === Number.NEGATIVE_INFINITY) return 0;
  return Math.min(Math.max(Math.trunc(offset), 0), length);
}

function normalizeSelection(source: string, selection: TextSelection | null): TextSelection {
  if (selection === null) return { start: 0, end: 0 };

  const first = clampOffset(selection.start, source.length);
  const second = clampOffset(selection.end, source.length);
  return first <= second ? { start: first, end: second } : { start: second, end: first };
}

function unchangedEdit(source: string, selection: TextSelection): FormattingEdit {
  return {
    value: source,
    selectionStart: selection.start,
    selectionEnd: selection.end,
    changed: false,
    replaceStart: selection.start,
    replaceEnd: selection.end,
    replacement: source.slice(selection.start, selection.end)
  };
}

function changedEdit(
  source: string,
  replaceStart: number,
  replaceEnd: number,
  replacement: string,
  selectionStart: number,
  selectionEnd: number
): FormattingEdit {
  return {
    value: source.slice(0, replaceStart) + replacement + source.slice(replaceEnd),
    selectionStart,
    selectionEnd,
    changed: true,
    replaceStart,
    replaceEnd,
    replacement
  };
}

export function formatComposerSelection(
  source: string | null | undefined,
  selection: TextSelection | null,
  kind: FormattingKind
): FormattingEdit {
  const value = source ?? "";
  const normalized = normalizeSelection(value, selection);
  if (normalized.start === normalized.end) return unchangedEdit(value, normalized);

  const delimiter = formattingDelimiters[kind];
  const selected = value.slice(normalized.start, normalized.end);

  if (
    selected.length >= delimiter.length * 2 &&
    selected.startsWith(delimiter) &&
    selected.endsWith(delimiter)
  ) {
    const inner = selected.slice(delimiter.length, selected.length - delimiter.length);
    return changedEdit(
      value,
      normalized.start,
      normalized.end,
      inner,
      normalized.start,
      normalized.start + inner.length
    );
  }

  const outerStart = normalized.start - delimiter.length;
  const outerEnd = normalized.end + delimiter.length;
  if (
    outerStart >= 0 &&
    outerEnd <= value.length &&
    value.slice(outerStart, normalized.start) === delimiter &&
    value.slice(normalized.end, outerEnd) === delimiter
  ) {
    return changedEdit(
      value,
      outerStart,
      outerEnd,
      selected,
      outerStart,
      outerStart + selected.length
    );
  }

  const replacement = delimiter + selected + delimiter;
  return changedEdit(
    value,
    normalized.start,
    normalized.end,
    replacement,
    normalized.start + delimiter.length,
    normalized.end + delimiter.length
  );
}
