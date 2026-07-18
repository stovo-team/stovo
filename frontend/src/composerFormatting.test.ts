import { describe, expect, it } from "vitest";

import {
  FormattingKind,
  formatComposerSelection,
  formattingDelimiters
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
      spoiler: "||"
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
