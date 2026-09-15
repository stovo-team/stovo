import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  RichCanvasPreview,
  buildCanvasPreviewBudget,
  MAX_CANVAS_PREVIEW_LINES,
  WHITEBOARD_EQUIVALENT_LINES,
  type ParsedCanvasBlock,
} from "./RichCanvasPreview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function createUpdates(
  blocksData: Array<
    | { kind: "markdown"; text: string }
    | { kind: "whiteboard"; scene: unknown[] }
  >
) {
  const doc = new Y.Doc();
  const blocks = doc.getArray("blocks");
  blocksData.forEach((b, idx) => {
    const map = new Y.Map();
    map.set("id", `b-${idx}`);
    map.set("kind", b.kind);
    if (b.kind === "markdown") {
      map.set("content", new Y.Text(b.text));
    } else {
      map.set("scene", new Y.Text(JSON.stringify(b.scene)));
    }
    blocks.push([map]);
  });
  const bytes = Y.encodeStateAsUpdate(doc);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return [
    {
      sequence: 1,
      update: btoa(binary),
      createdBy: "u1",
      createdAt: "2026-09-08T00:00:00Z",
    },
  ];
}

describe("RichCanvasPreview Budget Logic", () => {
  it("constants match user requirements (30 max lines, 5 whiteboard lines)", () => {
    expect(MAX_CANVAS_PREVIEW_LINES).toBe(30);
    expect(WHITEBOARD_EQUIVALENT_LINES).toBe(5);
  });

  it("includes whiteboard inline when markdown lines <= 25", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
    const blocks: ParsedCanvasBlock[] = [
      { id: "1", kind: "markdown", lines },
      {
        id: "2",
        kind: "whiteboard",
        elements: [{ type: "rectangle", x: 0, y: 0, width: 50, height: 50 }],
      },
    ];

    const budget = buildCanvasPreviewBudget(blocks);
    expect(budget.hasWhiteboard).toBe(true);
    expect(budget.items.some((it) => it.kind === "whiteboard")).toBe(true);
    expect(budget.isTruncated).toBe(false);
  });

  it("omits whiteboard when markdown lines > 25", () => {
    const lines = Array.from({ length: 26 }, (_, i) => `Line ${i + 1}`);
    const blocks: ParsedCanvasBlock[] = [
      { id: "1", kind: "markdown", lines },
      {
        id: "2",
        kind: "whiteboard",
        elements: [{ type: "rectangle", x: 0, y: 0, width: 50, height: 50 }],
      },
    ];

    const budget = buildCanvasPreviewBudget(blocks);
    expect(budget.hasWhiteboard).toBe(false);
    expect(budget.items.some((it) => it.kind === "whiteboard")).toBe(false);
    expect(budget.isTruncated).toBe(true);
  });

  it("truncates markdown at 30 lines when more than 30 lines exist", () => {
    const lines = Array.from({ length: 45 }, (_, i) => `Line ${i + 1}`);
    const blocks: ParsedCanvasBlock[] = [{ id: "1", kind: "markdown", lines }];

    const budget = buildCanvasPreviewBudget(blocks);
    const mdItem = budget.items.find((it) => it.kind === "markdown");
    expect(mdItem?.lines.length).toBe(30);
    expect(budget.isTruncated).toBe(true);
  });
});

describe("RichCanvasPreview Component Rendering", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  it("renders empty canvas placeholder when document has no updates or empty blocks", async () => {
    await act(async () => {
      root?.render(<RichCanvasPreview canvas={{ title: "Test" }} updates={[]} />);
    });

    expect(container?.querySelector(".canvas-preview-blank")).not.toBeNull();
    expect(container?.textContent).toContain("Empty canvas");
  });

  it("renders whiteboard-only canvas with full SVG preview", async () => {
    const updates = createUpdates([
      {
        kind: "whiteboard",
        scene: [
          {
            type: "rectangle",
            x: 10,
            y: 10,
            width: 80,
            height: 40,
            strokeColor: "#818cf8",
          },
        ],
      },
    ]);

    await act(async () => {
      root?.render(
        <RichCanvasPreview canvas={{ title: "Drawings" }} updates={updates} />
      );
    });

    const svg = container?.querySelector(".canvas-preview-svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("rect")).not.toBeNull();
  });

  it("renders rich markdown formatting: headings, checkboxes, bullets, quotes, code", async () => {
    const markdownContent = [
      "# Main Title",
      "## Section Subtitle",
      "- [x] Completed task with **bold**",
      "- [ ] Open task with `inline code`",
      "- Standard bullet point",
      "1. Numbered item",
      "> Quoted insight",
    ].join("\n");

    const updates = createUpdates([{ kind: "markdown", text: markdownContent }]);

    await act(async () => {
      root?.render(
        <RichCanvasPreview canvas={{ title: "Roadmap" }} updates={updates} />
      );
    });

    expect(container?.querySelector(".canvas-md-h1")).not.toBeNull();
    expect(container?.querySelector(".canvas-md-h2")).not.toBeNull();
    expect(container?.querySelector(".canvas-md-check.is-checked")).not.toBeNull();
    expect(container?.querySelector(".canvas-md-checkbox.checked")).not.toBeNull();
    expect(container?.querySelector(".canvas-md-bullet")).not.toBeNull();
    expect(container?.querySelector(".canvas-md-numbered")).not.toBeNull();
    expect(container?.querySelector(".canvas-md-quote")).not.toBeNull();
    expect(container?.querySelector(".canvas-md-inline-code")).not.toBeNull();
    expect(container?.querySelector("strong")).not.toBeNull();
  });

  it("renders inline whiteboard when markdown <= 25 lines", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `- Item ${i + 1}`).join("\n");
    const updates = createUpdates([
      { kind: "markdown", text: lines },
      {
        kind: "whiteboard",
        scene: [
          {
            type: "ellipse",
            x: 5,
            y: 5,
            width: 40,
            height: 40,
            strokeColor: "#34d399",
          },
        ],
      },
    ]);

    await act(async () => {
      root?.render(
        <RichCanvasPreview canvas={{ title: "Mixed" }} updates={updates} />
      );
    });

    expect(
      container?.querySelector(".canvas-preview-inline-whiteboard")
    ).not.toBeNull();
    expect(container?.querySelector(".canvas-inline-wb-svg ellipse")).not.toBeNull();
  });

  it("suppresses whiteboard and shows fade when markdown > 25 lines", async () => {
    const lines = Array.from({ length: 28 }, (_, i) => `Paragraph line ${i + 1}`).join(
      "\n"
    );
    const updates = createUpdates([
      { kind: "markdown", text: lines },
      {
        kind: "whiteboard",
        scene: [
          {
            type: "rectangle",
            x: 0,
            y: 0,
            width: 60,
            height: 60,
          },
        ],
      },
    ]);

    await act(async () => {
      root?.render(
        <RichCanvasPreview canvas={{ title: "Long doc" }} updates={updates} />
      );
    });

    // Whiteboard must NOT be rendered because markdown > 25 lines
    expect(
      container?.querySelector(".canvas-preview-inline-whiteboard")
    ).toBeNull();
    expect(container?.querySelector(".canvas-inline-wb-svg")).toBeNull();
    // Truncation fade is visible
    expect(container?.querySelector(".canvas-preview-fade")).not.toBeNull();
  });

  it("hides header badge when hideHeader is true", async () => {
    const updates = createUpdates([{ kind: "markdown", text: "# Hello\nWorld" }]);
    await act(async () => {
      root?.render(
        <RichCanvasPreview canvas={{ title: "Doc" }} updates={updates} hideHeader />
      );
    });

    expect(container?.querySelector(".canvas-preview-header")).toBeNull();
    expect(container?.textContent).toContain("World");
  });
});
