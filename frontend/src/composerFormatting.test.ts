import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyFormattingToTextarea,
  FormattingKind,
  formatComposerSelection,
  formattingDelimiters,
  measureTextareaSelectionAnchor
} from "./composerFormatting";

const kinds = Object.entries({
  bold: "**",
  italic: "_",
  underline: "__",
  strikethrough: "~~",
  spoiler: "||"
}) as [FormattingKind, string][];

describe.each(kinds)("formatComposerSelection %s", (kind, delimiter) => {
  it("wraps the exact selected occurrence and keeps its contents selected", () => {
    const source = "same / same / tail";
    const start = source.lastIndexOf("same");
    const edit = formatComposerSelection(source, { start, end: start + 4 }, kind);

    expect(edit).toEqual({
      value: `same / ${delimiter}same${delimiter} / tail`,
      selectionStart: start + delimiter.length,
      selectionEnd: start + delimiter.length + 4,
      changed: true,
      replaceStart: start,
      replaceEnd: start + 4,
      replacement: `${delimiter}same${delimiter}`
    });
  });

  it("unwraps when the exact selection is immediately enclosed", () => {
    const source = `before ${delimiter}selected${delimiter} after`;
    const start = "before ".length + delimiter.length;
    const edit = formatComposerSelection(source, { start, end: start + "selected".length }, kind);

    expect(edit).toEqual({
      value: "before selected after",
      selectionStart: "before ".length,
      selectionEnd: "before selected".length,
      changed: true,
      replaceStart: "before ".length,
      replaceEnd: "before ".length + delimiter.length * 2 + "selected".length,
      replacement: "selected"
    });
  });

  it("unwraps when the selected slice includes one balanced marker pair", () => {
    const source = `before ${delimiter}selected${delimiter} after`;
    const start = "before ".length;
    const end = start + delimiter.length * 2 + "selected".length;
    const edit = formatComposerSelection(source, { start, end }, kind);

    expect(edit).toEqual({
      value: "before selected after",
      selectionStart: start,
      selectionEnd: start + "selected".length,
      changed: true,
      replaceStart: start,
      replaceEnd: end,
      replacement: "selected"
    });
  });

  it("preserves surrounding content and multiline text exactly", () => {
    const selected = " first line\nsecond line ";
    const source = `prefix:${selected}:suffix`;
    const edit = formatComposerSelection(
      source,
      { start: "prefix:".length, end: "prefix:".length + selected.length },
      kind
    );

    expect(edit.value).toBe(`prefix:${delimiter}${selected}${delimiter}:suffix`);
    expect(edit.value.slice(edit.selectionStart, edit.selectionEnd)).toBe(selected);
  });
});

describe("formatComposerSelection boundary behavior", () => {
  it("exports the complete syntax map", () => {
    expect(formattingDelimiters).toEqual({
      bold: "**",
      italic: "_",
      underline: "__",
      strikethrough: "~~",
      spoiler: "||",
      code: "`",
      quote: "> "
    });
  });

  it.each([
    ["null source", null, { start: 0, end: 1 }, 0, 0],
    ["undefined source", undefined, { start: 0, end: 1 }, 0, 0],
    ["null selection", "draft", null, 0, 0],
    ["collapsed selection", "draft", { start: 2, end: 2 }, 2, 2],
    ["fully low out-of-range", "draft", { start: -9, end: -2 }, 0, 0],
    ["fully high out-of-range", "draft", { start: 20, end: 30 }, 5, 5]
  ])("returns a deterministic no-op for %s", (_label, source, selection, start, end) => {
    const edit = formatComposerSelection(source, selection, "bold");

    expect(edit).toEqual({
      value: source ?? "",
      selectionStart: start,
      selectionEnd: end,
      changed: false,
      replaceStart: start,
      replaceEnd: end,
      replacement: (source ?? "").slice(start, end)
    });
  });

  it("sorts reversed bounds and clamps oversized values before wrapping", () => {
    const edit = formatComposerSelection("abcdef", { start: 99, end: -3 }, "italic");

    expect(edit).toEqual({
      value: "_abcdef_",
      selectionStart: 1,
      selectionEnd: 7,
      changed: true,
      replaceStart: 0,
      replaceEnd: 6,
      replacement: "_abcdef_"
    });
  });

  it("wraps a single ASCII code unit", () => {
    const edit = formatComposerSelection("abc", { start: 1, end: 2 }, "underline");

    expect(edit.value).toBe("a__b__c");
    expect(edit.value.slice(edit.selectionStart, edit.selectionEnd)).toBe("b");
  });

  it.each([
    ["astral emoji", "😀"],
    ["skin-tone emoji", "👍🏽"],
    ["ZWJ family", "👨‍👩‍👧‍👦"],
    ["combining sequence", "e\u0301"],
    ["precomposed character", "é"],
    ["decomposed character", "e\u0301"]
  ])("preserves the exact UTF-16 substring for %s", (_label, selected) => {
    const source = `left:${selected}:right`;
    const start = "left:".length;
    const edit = formatComposerSelection(source, { start, end: start + selected.length }, "spoiler");

    expect(edit.value).toBe(`left:||${selected}||:right`);
    expect(edit.value.slice(edit.selectionStart, edit.selectionEnd)).toBe(selected);
    expect(edit.selectionEnd - edit.selectionStart).toBe(selected.length);
  });

  it("honors programmatic offsets inside an astral character without reindexing", () => {
    const source = "A😀B";
    const selectedCodeUnit = source.slice(1, 2);
    const edit = formatComposerSelection(source, { start: 1, end: 2 }, "italic");

    expect(edit.value).toBe(`A_${selectedCodeUnit}_${source.slice(2)}`);
    expect(edit.value.slice(edit.selectionStart, edit.selectionEnd)).toBe(selectedCodeUnit);
    expect(edit.selectionEnd - edit.selectionStart).toBe(1);
  });

  it("does not normalize canonically equivalent text", () => {
    const composed = "é";
    const decomposed = "e\u0301";
    const source = `${composed}/${decomposed}`;
    const start = composed.length + 1;
    const edit = formatComposerSelection(source, { start, end: source.length }, "bold");

    expect(edit.value).toBe(`${composed}/**${decomposed}**`);
    expect(edit.value.normalize("NFC")).not.toBe(edit.value);
  });
});

describe("applyFormattingToTextarea", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("uses one native edit, then focuses and restores the selected inner source", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "before selected after";
    document.body.append(textarea);
    const events: string[] = [];
    const nativeSetRangeText = textarea.setRangeText.bind(textarea);
    const setRangeText = vi
      .spyOn(textarea, "setRangeText")
      .mockImplementation((replacement, start, end, selectionMode) => {
        events.push("setRangeText");
        nativeSetRangeText(replacement, start, end, selectionMode);
      });
    const focus = vi.spyOn(textarea, "focus").mockImplementation(() => {
      events.push("focus");
    });
    const nativeSetSelectionRange = textarea.setSelectionRange.bind(textarea);
    const setSelectionRange = vi
      .spyOn(textarea, "setSelectionRange")
      .mockImplementation((start, end, direction) => {
        events.push("setSelectionRange");
        nativeSetSelectionRange(start, end, direction);
      });

    const edit = applyFormattingToTextarea(textarea, { start: 7, end: 15 }, "bold");

    expect(setRangeText).toHaveBeenCalledOnce();
    expect(setRangeText).toHaveBeenCalledWith("**selected**", 7, 15, "preserve");
    expect(focus).toHaveBeenCalledOnce();
    expect(setSelectionRange).toHaveBeenCalledWith(9, 17);
    expect(events).toEqual(["setRangeText", "focus", "setSelectionRange"]);
    expect(textarea.value).toBe("before **selected** after");
    expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe("selected");
    expect(edit.value).toBe(textarea.value);
  });

  it("does not mutate or focus for a missing or collapsed selection", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "draft";
    const setRangeText = vi.spyOn(textarea, "setRangeText");
    const focus = vi.spyOn(textarea, "focus");

    const missing = applyFormattingToTextarea(null, { start: 0, end: 2 }, "italic");
    const collapsed = applyFormattingToTextarea(textarea, { start: 2, end: 2 }, "italic");
    const nullSelection = applyFormattingToTextarea(textarea, null, "italic");

    expect(missing.changed).toBe(false);
    expect(collapsed.changed).toBe(false);
    expect(nullSelection.changed).toBe(false);
    expect(textarea.value).toBe("draft");
    expect(setRangeText).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it("rejects an edit above the default 4,000 UTF-16 code-unit limit", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "a".repeat(3999);
    const setRangeText = vi.spyOn(textarea, "setRangeText");
    const focus = vi.spyOn(textarea, "focus");

    const edit = applyFormattingToTextarea(textarea, { start: 0, end: 1 }, "bold");

    expect(edit).toMatchObject({ value: textarea.value, changed: false });
    expect(textarea.value).toHaveLength(3999);
    expect(setRangeText).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it.each([
    ["astral", "😀"],
    ["ZWJ", "👨‍👩‍👧‍👦"],
    ["combining", "e\u0301"],
    ["multiline", "first\nsecond"],
    ["composed and decomposed", "é/e\u0301"]
  ])("preserves exact %s source through the native edit", (_label, selected) => {
    const textarea = document.createElement("textarea");
    textarea.value = `left:${selected}:right`;
    const start = "left:".length;

    const edit = applyFormattingToTextarea(
      textarea,
      { start, end: start + selected.length },
      "spoiler"
    );

    expect(edit.value).toBe(`left:||${selected}||:right`);
    expect(textarea.value.slice(edit.selectionStart, edit.selectionEnd)).toBe(selected);
  });

  it("wraps then unwraps every formatting kind on the exact Unicode range without shifting focus or neighbors", () => {
    const kinds: FormattingKind[] = [
      "bold",
      "italic",
      "underline",
      "strikethrough",
      "spoiler"
    ];
    const selected = "é/e\u0301/\ud83d\ude80";
    const neighbor = "prefix:";
    const tail = ":suffix";

    for (const kind of kinds) {
      const textarea = document.createElement("textarea");
      textarea.value = `${neighbor}${selected}${tail}`;
      document.body.append(textarea);
      const start = neighbor.length;
      const end = start + selected.length;
      const focus = vi.spyOn(textarea, "focus");

      const wrapped = applyFormattingToTextarea(textarea, { start, end }, kind);
      expect(wrapped.changed).toBe(true);
      expect(textarea.value.startsWith(neighbor)).toBe(true);
      expect(textarea.value.endsWith(tail)).toBe(true);
      expect(textarea.value.slice(wrapped.selectionStart, wrapped.selectionEnd)).toBe(selected);
      expect(focus).toHaveBeenCalledOnce();
      expect(document.activeElement === textarea || focus.mock.calls.length === 1).toBe(true);

      const unwrapped = applyFormattingToTextarea(
        textarea,
        { start: wrapped.selectionStart, end: wrapped.selectionEnd },
        kind
      );
      expect(unwrapped.value).toBe(`${neighbor}${selected}${tail}`);
      expect(textarea.value.slice(unwrapped.selectionStart, unwrapped.selectionEnd)).toBe(selected);
      expect(focus).toHaveBeenCalledTimes(2);
      textarea.remove();
    }
  });
});

describe("measureTextareaSelectionAnchor", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("returns null for missing, empty, collapsed, or over-limit selections", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "draft";

    expect(measureTextareaSelectionAnchor(null, { start: 0, end: 1 })).toBeNull();
    expect(measureTextareaSelectionAnchor(textarea, null)).toBeNull();
    expect(measureTextareaSelectionAnchor(textarea, { start: 2, end: 2 })).toBeNull();
    textarea.value = "x".repeat(4001);
    expect(measureTextareaSelectionAnchor(textarea, { start: 0, end: 1 })).toBeNull();
    expect(document.querySelector(".composer-selection-mirror")).toBeNull();
  });

  it.each([
    ["one code unit", "x", { start: 0, end: 1 }],
    ["one grapheme", "😀", { start: 0, end: 2 }],
    ["multiline Unicode", "one\n👨‍👩‍👧‍👦 e\u0301", { start: 4, end: 17 }]
  ])("returns finite viewport-clamped coordinates for %s", (_label, value, selection) => {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.scrollLeft = 7;
    textarea.scrollTop = 11;
    textarea.getBoundingClientRect = vi.fn(() => new DOMRect(40, 50, 200, 80));
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 100 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 100 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.tagName === "SPAN") return new DOMRect(-30, 200, 10, 16);
      return new DOMRect(0, 0, 0, 0);
    });
    const initialValue = textarea.value;
    const initialSelection = { ...selection };

    const anchor = measureTextareaSelectionAnchor(textarea, selection);

    expect(anchor).toEqual({ left: 12, top: 88 });
    expect(Number.isFinite(anchor?.left)).toBe(true);
    expect(Number.isFinite(anchor?.top)).toBe(true);
    expect(textarea.value).toBe(initialValue);
    expect(selection).toEqual(initialSelection);
    expect(document.querySelector(".composer-selection-mirror")).toBeNull();
  });

  it("copies untrusted draft content as text and always removes the mirror", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "<img src=x onerror=alert(1)>";
    textarea.getBoundingClientRect = vi.fn(() => new DOMRect(10, 20, 200, 80));
    const appendChild = vi.spyOn(document.body, "appendChild");

    const anchor = measureTextareaSelectionAnchor(textarea, { start: 0, end: textarea.value.length });
    const mirror = appendChild.mock.calls[0]?.[0] as HTMLElement;

    expect(anchor).not.toBeNull();
    expect(mirror.textContent).toContain(textarea.value);
    expect(mirror.querySelector("img")).toBeNull();
    expect(mirror.isConnected).toBe(false);
  });

  it("removes the mirror and returns null when measurement throws", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "selected";
    textarea.getBoundingClientRect = vi.fn(() => new DOMRect(10, 20, 200, 80));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.tagName === "SPAN") throw new Error("layout failed");
      return new DOMRect(0, 0, 0, 0);
    });

    expect(measureTextareaSelectionAnchor(textarea, { start: 0, end: 8 })).toBeNull();
    expect(document.querySelector(".composer-selection-mirror")).toBeNull();
  });
});
