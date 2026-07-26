export type FormattingKind =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "spoiler"
  | "code"
  | "quote";

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
  spoiler: "||",
  code: "`",
  quote: "> "
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

  if (kind === "quote") {
    const quoted = selected
      .split("\n")
      .map((line) => (line.startsWith("> ") ? line.slice(2) : `> ${line}`))
      .join("\n");
    const stripping = selected.split("\n").every((line) => line.startsWith("> ") || line === ">");
    const replacement = stripping
      ? selected
          .split("\n")
          .map((line) => (line.startsWith("> ") ? line.slice(2) : line === ">" ? "" : line))
          .join("\n")
      : quoted;
    return changedEdit(
      value,
      normalized.start,
      normalized.end,
      replacement,
      normalized.start,
      normalized.start + replacement.length
    );
  }

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

const defaultComposerMaxLength = 4000;
const toolbarViewportGutter = 12;

export function applyFormattingToTextarea(
  textarea: HTMLTextAreaElement | null,
  selection: TextSelection | null,
  kind: FormattingKind,
  maxLength = defaultComposerMaxLength
): FormattingEdit {
  if (textarea === null) return unchangedEdit("", { start: 0, end: 0 });

  const normalized = normalizeSelection(textarea.value, selection);
  const edit = formatComposerSelection(textarea.value, normalized, kind);
  if (!edit.changed || edit.value.length > maxLength) {
    return unchangedEdit(textarea.value, normalized);
  }

  textarea.setRangeText(edit.replacement, edit.replaceStart, edit.replaceEnd, "preserve");
  textarea.focus();
  textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);

  return { ...edit, value: textarea.value };
}

const mirrorStyleProperties = [
  "box-sizing",
  "width",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "font-stretch",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-indent",
  "text-transform",
  "direction",
  "tab-size",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "white-space",
  "overflow-wrap",
  "word-break"
] as const;

function clampViewportCoordinate(value: number, viewportSize: number): number {
  const maximum = Math.max(toolbarViewportGutter, viewportSize - toolbarViewportGutter);
  return Math.min(Math.max(value, toolbarViewportGutter), maximum);
}

export function measureTextareaSelectionAnchor(
  textarea: HTMLTextAreaElement | null,
  selection: TextSelection | null
): ToolbarAnchor | null {
  if (textarea === null || textarea.value.length === 0 || textarea.value.length > defaultComposerMaxLength) {
    return null;
  }

  const normalized = normalizeSelection(textarea.value, selection);
  if (normalized.start === normalized.end) return null;

  const mirror = document.createElement("div");
  try {
    const textareaRect = textarea.getBoundingClientRect();
    const computed = window.getComputedStyle(textarea);
    mirror.className = "composer-selection-mirror";
    for (const property of mirrorStyleProperties) {
      mirror.style.setProperty(property, computed.getPropertyValue(property));
    }
    mirror.style.position = "fixed";
    mirror.style.left = `${textareaRect.left - textarea.scrollLeft}px`;
    mirror.style.top = `${textareaRect.top - textarea.scrollTop}px`;
    mirror.style.width = `${textareaRect.width}px`;
    mirror.style.height = "auto";
    mirror.style.minHeight = `${textareaRect.height}px`;
    mirror.style.overflow = "hidden";
    mirror.style.pointerEvents = "none";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.overflowWrap = "break-word";

    const marker = document.createElement("span");
    mirror.append(
      document.createTextNode(textarea.value.slice(0, normalized.start)),
      marker,
      document.createTextNode(textarea.value.slice(normalized.end))
    );
    marker.textContent = textarea.value.slice(normalized.start, normalized.end);
    document.body.appendChild(mirror);

    const markerRect = marker.getBoundingClientRect();
    const rawLeft = markerRect.left + markerRect.width / 2;
    const rawTop = markerRect.top - 8;
    if (!Number.isFinite(rawLeft) || !Number.isFinite(rawTop)) return null;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    return {
      left: clampViewportCoordinate(rawLeft, viewportWidth),
      top: clampViewportCoordinate(rawTop, viewportHeight)
    };
  } catch {
    return null;
  } finally {
    mirror.remove();
  }
}
