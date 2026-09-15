import { ReactNode, useMemo } from "react";
import { Check, FileText, Pencil } from "lucide-react";
import * as Y from "yjs";
import type { Canvas, CanvasReference, CanvasUpdate } from "../api/canvas";

export interface WhiteboardElement {
  id?: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  points?: [number, number][];
  text?: string;
  fontSize?: number;
  isDeleted?: boolean;
}

export type ParsedCanvasBlock =
  | {
      id: string;
      kind: "markdown";
      lines: string[];
    }
  | {
      id: string;
      kind: "whiteboard";
      elements: WhiteboardElement[];
    };

export const MAX_CANVAS_PREVIEW_LINES = 30;
export const WHITEBOARD_EQUIVALENT_LINES = 5;

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function parseCanvasBlocks(
  updates?: CanvasUpdate[],
  canvasTitle = ""
): ParsedCanvasBlock[] {
  if (!updates || updates.length === 0) {
    return [];
  }
  try {
    const doc = new Y.Doc();
    updates.forEach(({ update }) => {
      try {
        Y.applyUpdate(doc, base64ToBytes(update));
      } catch {}
    });
    const blocks = doc.getArray<Y.Map<unknown>>("blocks");
    const parsed: ParsedCanvasBlock[] = [];
    let isFirstMarkdown = true;

    blocks.forEach((record, index) => {
      const kind = record.get("kind");
      const id = String(record.get("id") || `block-${index}`);

      if (kind === "markdown") {
        const text = (record.get("content") as Y.Text)?.toString() || "";
        const allLines = text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        let usableLines = allLines;
        if (isFirstMarkdown && allLines.length > 0) {
          isFirstMarkdown = false;
          const lowerTitle = canvasTitle.trim().toLowerCase();
          const firstLineStripped = allLines[0]
            .replace(/^#{1,6}\s*/, "")
            .trim()
            .toLowerCase();
          const firstLineIsDefault = firstLineStripped === "untitled canvas";
          const firstLineMatchesTitle =
            Boolean(lowerTitle) && firstLineStripped === lowerTitle;

          if (allLines.length === 1) {
            if (firstLineIsDefault || firstLineMatchesTitle) {
              usableLines = [];
            }
          } else if (firstLineIsDefault || firstLineMatchesTitle) {
            usableLines = allLines.slice(1);
          }
        }

        if (usableLines.length > 0) {
          parsed.push({ id, kind: "markdown", lines: usableLines });
        }
      } else if (kind === "whiteboard") {
        const scene = (record.get("scene") as Y.Text)?.toString() || "";
        let elements: WhiteboardElement[] = [];
        if (scene.trim()) {
          try {
            const json = JSON.parse(scene);
            if (Array.isArray(json)) {
              elements = json.filter((el) => !el?.isDeleted);
            }
          } catch {}
        }
        if (elements.length > 0) {
          parsed.push({ id, kind: "whiteboard", elements });
        }
      }
    });

    return parsed;
  } catch {
    return [];
  }
}

/**
 * Calculates budget allocation for up to 30 lines.
 * Rule:
 * - Whiteboard = 5 lines.
 * - Max lines = 30.
 * - If total markdown lines > 25, whiteboard is NOT shown.
 * - If total markdown lines <= 25, whiteboard is shown inline.
 */
export function buildCanvasPreviewBudget(blocks: ParsedCanvasBlock[]): {
  items: Array<
    | { id: string; kind: "markdown"; lines: string[] }
    | { id: string; kind: "whiteboard"; elements: WhiteboardElement[] }
  >;
  totalMarkdownLines: number;
  hasWhiteboard: boolean;
  isTruncated: boolean;
} {
  const totalMarkdownLines = blocks.reduce(
    (sum, b) => (b.kind === "markdown" ? sum + b.lines.length : sum),
    0
  );
  const rawWhiteboardCount = blocks.filter((b) => b.kind === "whiteboard").length;

  const allowWhiteboard =
    totalMarkdownLines <= MAX_CANVAS_PREVIEW_LINES - WHITEBOARD_EQUIVALENT_LINES;

  let usedLines = 0;
  let isTruncated = false;
  const items: Array<
    | { id: string; kind: "markdown"; lines: string[] }
    | { id: string; kind: "whiteboard"; elements: WhiteboardElement[] }
  > = [];

  for (const block of blocks) {
    if (usedLines >= MAX_CANVAS_PREVIEW_LINES) {
      isTruncated = true;
      break;
    }

    if (block.kind === "whiteboard") {
      if (!allowWhiteboard) {
        // Suppress whiteboard when markdown has too many lines (> 25)
        isTruncated = true;
        continue;
      }
      if (usedLines + WHITEBOARD_EQUIVALENT_LINES <= MAX_CANVAS_PREVIEW_LINES) {
        items.push(block);
        usedLines += WHITEBOARD_EQUIVALENT_LINES;
      } else {
        isTruncated = true;
      }
    } else if (block.kind === "markdown") {
      const remaining = MAX_CANVAS_PREVIEW_LINES - usedLines;
      if (remaining <= 0) {
        isTruncated = true;
        break;
      }
      if (block.lines.length <= remaining) {
        items.push(block);
        usedLines += block.lines.length;
      } else {
        items.push({
          id: block.id,
          kind: "markdown",
          lines: block.lines.slice(0, remaining),
        });
        usedLines += remaining;
        isTruncated = true;
      }
    }
  }

  if (totalMarkdownLines > MAX_CANVAS_PREVIEW_LINES || (rawWhiteboardCount > 0 && !allowWhiteboard)) {
    isTruncated = true;
  }

  const hasWhiteboard = items.some((it) => it.kind === "whiteboard");

  return { items, totalMarkdownLines, hasWhiteboard, isTruncated };
}

function isDarkColor(color?: string): boolean {
  if (!color || color === "transparent") return false;
  const hexMatch = /^#([0-9a-f]{3,8})$/i.exec(color.trim());
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum < 0.38;
  }
  const rgbMatch = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(color.trim());
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum < 0.38;
  }
  return color.toLowerCase() === "black";
}

function resolveStrokeColor(color?: string): string {
  if (!color || color === "transparent") return "#818cf8";
  if (isDarkColor(color)) return "#f1f5f9";
  return color;
}

function resolveFillColor(color?: string): string {
  if (!color || color === "transparent") return "rgba(129, 140, 248, 0.16)";
  if (isDarkColor(color)) return "rgba(241, 245, 249, 0.14)";
  return color;
}

export function WhiteboardSvgView({
  elements,
  className = "canvas-preview-svg",
}: {
  elements: WhiteboardElement[];
  className?: string;
}) {
  const activeElements = useMemo(
    () => elements.filter((el) => !el.isDeleted),
    [elements]
  );

  const viewBox = useMemo(() => {
    if (activeElements.length === 0) return "0 0 100 100";
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of activeElements) {
      const x = el.x ?? 0;
      const y = el.y ?? 0;
      const w = el.width ?? 0;
      const h = el.height ?? 0;
      if (el.points && Array.isArray(el.points) && el.points.length > 0) {
        for (const [px, py] of el.points) {
          minX = Math.min(minX, x + px);
          minY = Math.min(minY, y + py);
          maxX = Math.max(maxX, x + px);
          maxY = Math.max(maxY, y + py);
        }
      } else {
        minX = Math.min(minX, x, x + w);
        minY = Math.min(minY, y, y + h);
        maxX = Math.max(maxX, x, x + w);
        maxY = Math.max(maxY, y, y + h);
      }
    }

    if (!isFinite(minX) || !isFinite(maxX) || minX >= maxX) {
      minX = 0;
      maxX = 100;
    }
    if (!isFinite(minY) || !isFinite(maxY) || minY >= maxY) {
      minY = 0;
      maxY = 100;
    }

    const contentWidth = Math.max(maxX - minX, 1);
    const contentHeight = Math.max(maxY - minY, 1);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const renderWidth = Math.max(contentWidth, 40);
    const renderHeight = Math.max(contentHeight, 40);
    const pad = Math.max(renderWidth, renderHeight) * 0.15;
    const boxW = renderWidth + pad * 2;
    const boxH = renderHeight + pad * 2;
    return `${centerX - boxW / 2} ${centerY - boxH / 2} ${boxW} ${boxH}`;
  }, [activeElements]);

  if (activeElements.length === 0) return null;

  return (
    <svg
      viewBox={viewBox}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {activeElements.map((el, i) => {
        const stroke = resolveStrokeColor(el.strokeColor);
        const fill = resolveFillColor(el.backgroundColor);
        const sw = Math.max(el.strokeWidth || 1.75, 1.75);
        const x = el.x ?? 0;
        const y = el.y ?? 0;
        const w = el.width ?? 0;
        const h = el.height ?? 0;
        const key = el.id || `el-${i}`;

        if (el.type === "rectangle") {
          return (
            <rect
              key={key}
              x={Math.min(x, x + w)}
              y={Math.min(y, y + h)}
              width={Math.abs(w)}
              height={Math.abs(h)}
              rx={6}
              stroke={stroke}
              fill={fill}
              strokeWidth={sw}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if (el.type === "ellipse") {
          return (
            <ellipse
              key={key}
              cx={x + w / 2}
              cy={y + h / 2}
              rx={Math.abs(w) / 2}
              ry={Math.abs(h) / 2}
              stroke={stroke}
              fill={fill}
              strokeWidth={sw}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if (el.type === "diamond") {
          const midX = x + w / 2;
          const midY = y + h / 2;
          const pts = `${midX},${y} ${x + w},${midY} ${midX},${y + h} ${x},${midY}`;
          return (
            <polygon
              key={key}
              points={pts}
              stroke={stroke}
              fill={fill}
              strokeWidth={sw}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if ((el.type === "line" || el.type === "arrow") && el.points && el.points.length > 1) {
          const pts = el.points.map(([px, py]) => `${x + px},${y + py}`).join(" ");
          return (
            <polyline
              key={key}
              points={pts}
              stroke={stroke}
              fill="none"
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if (el.type === "freedraw" && el.points && el.points.length > 0) {
          const path =
            el.points.length === 1
              ? `M ${x + el.points[0][0]} ${y + el.points[0][1]} L ${x + el.points[0][0]} ${y + el.points[0][1]}`
              : el.points
                  .map(([px, py], idx) => `${idx === 0 ? "M" : "L"} ${x + px} ${y + py}`)
                  .join(" ");
          return (
            <path
              key={key}
              d={path}
              stroke={stroke}
              fill="none"
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if (el.type === "text" && el.text) {
          const fontSize = Math.max(el.fontSize || 14, 12);
          return (
            <text
              key={key}
              x={x}
              y={y + fontSize}
              fill={stroke}
              fontSize={fontSize}
              fontFamily="sans-serif"
              fontWeight="600"
            >
              {el.text}
            </text>
          );
        }
        return null;
      })}
    </svg>
  );
}

/** Renders inline markdown tokens (bold, code, italic) */
function renderInlineMarkdown(text: string) {
  const parts: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|~~([^~]+)~~)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [full, , bold, italic, code, strike] = match;
    if (bold !== undefined) {
      parts.push(<strong key={match.index}>{bold}</strong>);
    } else if (italic !== undefined) {
      parts.push(<em key={match.index}>{italic}</em>);
    } else if (code !== undefined) {
      parts.push(
        <code key={match.index} className="canvas-md-inline-code">
          {code}
        </code>
      );
    } else if (strike !== undefined) {
      parts.push(<del key={match.index}>{strike}</del>);
    } else {
      parts.push(full);
    }
    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/** Renders a single markdown line in rich styling */
function RichMarkdownLine({ line, index }: { line: string; index: number }) {
  // Checkbox: - [ ] or - [x]
  const checkMatch = /^[-*+]\s+\[([ xX])\]\s*(.*)$/.exec(line);
  if (checkMatch) {
    const isChecked = checkMatch[1].toLowerCase() === "x";
    return (
      <div key={index} className={`canvas-md-line canvas-md-check ${isChecked ? "is-checked" : ""}`}>
        <span className={`canvas-md-checkbox ${isChecked ? "checked" : ""}`}>
          {isChecked ? <Check size={10} strokeWidth={3} /> : null}
        </span>
        <span className={isChecked ? "canvas-md-check-done" : ""}>
          {renderInlineMarkdown(checkMatch[2])}
        </span>
      </div>
    );
  }

  // Heading 1: # ...
  const h1Match = /^#\s+(.*)$/.exec(line);
  if (h1Match) {
    return (
      <div key={index} className="canvas-md-line canvas-md-h1">
        {renderInlineMarkdown(h1Match[1])}
      </div>
    );
  }

  // Heading 2: ## ...
  const h2Match = /^##\s+(.*)$/.exec(line);
  if (h2Match) {
    return (
      <div key={index} className="canvas-md-line canvas-md-h2">
        {renderInlineMarkdown(h2Match[1])}
      </div>
    );
  }

  // Heading 3-6: ### ...
  const h3Match = /^#{3,6}\s+(.*)$/.exec(line);
  if (h3Match) {
    return (
      <div key={index} className="canvas-md-line canvas-md-h3">
        {renderInlineMarkdown(h3Match[1])}
      </div>
    );
  }

  // Bullet list: - or * or +
  const bulletMatch = /^[-*+]\s+(.*)$/.exec(line);
  if (bulletMatch) {
    return (
      <div key={index} className="canvas-md-line canvas-md-bullet">
        <span className="canvas-md-bullet-dot" aria-hidden="true" />
        <span>{renderInlineMarkdown(bulletMatch[1])}</span>
      </div>
    );
  }

  // Numbered list: 1. ...
  const numMatch = /^(\d+)\.\s+(.*)$/.exec(line);
  if (numMatch) {
    return (
      <div key={index} className="canvas-md-line canvas-md-numbered">
        <span className="canvas-md-num">{numMatch[1]}.</span>
        <span>{renderInlineMarkdown(numMatch[2])}</span>
      </div>
    );
  }

  // Blockquote: > ...
  const quoteMatch = /^>\s*(.*)$/.exec(line);
  if (quoteMatch) {
    return (
      <blockquote key={index} className="canvas-md-line canvas-md-quote">
        {renderInlineMarkdown(quoteMatch[1])}
      </blockquote>
    );
  }

  // Code block fence / indented code
  if (line.startsWith("```") || line.startsWith("    ")) {
    const codeContent = line.replace(/^```[a-z0-9]*\s*/i, "").replace(/```$/, "");
    return (
      <div key={index} className="canvas-md-line canvas-md-code-wrap">
        <code className="canvas-md-code-line">{codeContent || " "}</code>
      </div>
    );
  }

  // Horizontal rule: --- or ***
  if (/^[-*_]{3,}$/.test(line)) {
    return <hr key={index} className="canvas-md-hr" />;
  }

  // Normal paragraph line
  return (
    <p key={index} className="canvas-md-line canvas-md-p">
      {renderInlineMarkdown(line)}
    </p>
  );
}

export function RichCanvasPreview({
  canvas,
  updates,
  className = "",
  hideHeader = false,
}: {
  canvas: Canvas | CanvasReference | { title: string };
  updates?: CanvasUpdate[];
  className?: string;
  hideHeader?: boolean;
}) {
  const blocks = useMemo(
    () => parseCanvasBlocks(updates, canvas.title),
    [updates, canvas.title]
  );

  const { items, totalMarkdownLines, hasWhiteboard, isTruncated } = useMemo(
    () => buildCanvasPreviewBudget(blocks),
    [blocks]
  );

  // Empty canvas state
  if (items.length === 0) {
    return (
      <div className={`storage-tile-preview storage-canvas-preview ${hideHeader ? "no-header" : ""} ${className}`}>
        {!hideHeader && (
          <div className="canvas-preview-header">
            <div className="canvas-preview-badge">
              <Pencil size={11} />
              <b>CANVAS</b>
            </div>
          </div>
        )}
        <div className="canvas-preview-blank">
          <div className="canvas-empty-icon-wrap">
            <Pencil size={18} />
          </div>
          <div className="canvas-preview-empty-text">Empty canvas</div>
        </div>
      </div>
    );
  }

  // Whiteboard-only document
  if (totalMarkdownLines === 0 && hasWhiteboard) {
    const whiteboardBlock = items.find((it) => it.kind === "whiteboard");
    const elements = whiteboardBlock?.kind === "whiteboard" ? whiteboardBlock.elements : [];
    return (
      <div className={`storage-tile-preview storage-canvas-preview ${hideHeader ? "no-header" : ""} ${className}`}>
        {!hideHeader && (
          <div className="canvas-preview-header">
            <div className="canvas-preview-badge">
              <Pencil size={11} />
              <b>CANVAS</b>
            </div>
          </div>
        )}
        <div className="canvas-preview-body">
          <WhiteboardSvgView elements={elements} />
        </div>
      </div>
    );
  }

  // Rich markdown document with optional embedded whiteboard
  return (
    <div className={`storage-tile-preview storage-canvas-preview rich-canvas-preview ${hideHeader ? "no-header" : ""} ${className}`}>
      {!hideHeader && (
        <div className="canvas-preview-header">
          <div className="canvas-preview-badge canvas-preview-notes-badge">
            <FileText size={11} />
            <b>CANVAS</b>
          </div>
        </div>
      )}
      <div className="canvas-preview-notes rich-canvas-notes">
        <div className="canvas-preview-notes-lines">
          {items.map((item, itemIdx) => {
            if (item.kind === "whiteboard") {
              return (
                <div
                  key={item.id || `wb-${itemIdx}`}
                  className="canvas-preview-inline-whiteboard"
                  aria-label="Whiteboard drawing"
                >
                  <WhiteboardSvgView
                    elements={item.elements}
                    className="canvas-inline-wb-svg"
                  />
                </div>
              );
            }
            return (
              <div key={item.id || `md-${itemIdx}`} className="canvas-md-block">
                {item.lines.map((line, lineIdx) => (
                  <RichMarkdownLine
                    key={`line-${itemIdx}-${lineIdx}`}
                    line={line}
                    index={lineIdx}
                  />
                ))}
              </div>
            );
          })}
        </div>
        {(isTruncated || items.length >= 3) && (
          <div className="canvas-preview-fade" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
