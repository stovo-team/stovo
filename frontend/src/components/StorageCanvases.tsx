import { useEffect, useRef, useState } from "react";
import { FileText, Pencil, StickyNote } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as Y from "yjs";

import { getClusterPrefix } from "../api/client";
import { getCanvasDocument, getStorageCanvases, type Canvas, type CanvasUpdate } from "../api/canvas";
import type { StorageFilter } from "../pages/storageLibrary";
import {
  loadCachedCanvasPreviews,
  saveCachedCanvasPreviews,
  type CachedCanvasPreview,
} from "../fileLibraryCache";

interface WhiteboardElement {
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

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function parseCanvasDocument(updates?: CanvasUpdate[], canvasTitle = ""): {
  markdown: string;
  whiteboardElements: WhiteboardElement[];
} {
  if (!updates || updates.length === 0) {
    return { markdown: "", whiteboardElements: [] };
  }
  try {
    const doc = new Y.Doc();
    updates.forEach(({ update }) => {
      try {
        Y.applyUpdate(doc, base64ToBytes(update));
      } catch {}
    });
    const blocks = doc.getArray<Y.Map<unknown>>("blocks");
    let markdown = "";
    let whiteboardElements: WhiteboardElement[] = [];

    blocks.forEach((record) => {
      const kind = record.get("kind");
      if (kind === "markdown") {
        const text = (record.get("content") as Y.Text)?.toString() || "";
        const allLines = text
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        if (allLines.length > 0 && !markdown) {
          const lowerTitle = canvasTitle.trim().toLowerCase();
          const firstLineStripped = allLines[0].replace(/^#{1,6}\s*/, "").trim().toLowerCase();
          const firstLineIsDefault = firstLineStripped === "untitled canvas";
          const firstLineMatchesTitle = lowerTitle && firstLineStripped === lowerTitle;

          let usableLines: string[] = allLines;
          if (allLines.length === 1) {
            if (firstLineIsDefault) {
              usableLines = [];
            }
          } else if (firstLineIsDefault || firstLineMatchesTitle) {
            usableLines = allLines.slice(1);
          }

          if (usableLines.length > 0) {
            markdown = usableLines.join("\n");
          }
        }
      }
      if (kind === "whiteboard" && whiteboardElements.length === 0) {
        const scene = (record.get("scene") as Y.Text)?.toString() || "";
        if (scene.trim()) {
          try {
            const parsed = JSON.parse(scene);
            if (Array.isArray(parsed) && parsed.length > 0) {
              whiteboardElements = parsed;
            }
          } catch {}
        }
      }
    });
    return { markdown, whiteboardElements };
  } catch {
    return { markdown: "", whiteboardElements: [] };
  }
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

function CanvasTilePreview({
  canvas,
  updates
}: {
  canvas: Canvas;
  updates?: CanvasUpdate[];
}) {
  const { markdown, whiteboardElements } = parseCanvasDocument(updates, canvas.title);
  const activeElements = whiteboardElements.filter((el) => !el.isDeleted);

  // Canvas is a markdown document first: prioritize document notes if content exists
  if (markdown) {
    const rawLines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);
    const displayLines = rawLines.slice(0, 3);

    if (displayLines.length > 0) {
      return (
        <div className="storage-tile-preview storage-canvas-preview">
          <div className="canvas-preview-header">
            <div className="canvas-preview-badge canvas-preview-notes-badge">
              <FileText size={11} />
              <b>CANVAS</b>
            </div>
          </div>
          <div className="canvas-preview-notes">
            <div className="canvas-preview-notes-lines">
              {displayLines.map((line, idx) => {
                const isHeading = /^#{1,6}\s+/.test(line);
                const isBullet = /^[-*+]\s+/.test(line);
                const cleanText = line.replace(/^(#{1,6}|[-*+])\s+/, "");
                if (isHeading) {
                  return (
                    <p key={idx} className="canvas-notes-h">
                      {cleanText}
                    </p>
                  );
                }
                if (isBullet) {
                  return (
                    <p key={idx} className="canvas-notes-b">
                      {cleanText}
                    </p>
                  );
                }
                return (
                  <p key={idx} className="canvas-notes-p">
                    {cleanText}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      );
    }
  }

  if (activeElements.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
    const pad = Math.max(renderWidth, renderHeight) * 0.2;
    const boxW = renderWidth + pad * 2;
    const boxH = renderHeight + pad * 2;
    const viewBox = `${centerX - boxW / 2} ${centerY - boxH / 2} ${boxW} ${boxH}`;

    return (
      <div className="storage-tile-preview storage-canvas-preview">
        <div className="canvas-preview-header">
          <div className="canvas-preview-badge">
            <Pencil size={11} />
            <b>CANVAS</b>
          </div>
        </div>
        <div className="canvas-preview-body">
          <svg viewBox={viewBox} className="canvas-preview-svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
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
                return <polygon key={key} points={pts} stroke={stroke} fill={fill} strokeWidth={sw} vectorEffect="non-scaling-stroke" />;
              }
              if ((el.type === "line" || el.type === "arrow") && el.points && el.points.length > 1) {
                const pts = el.points.map(([px, py]) => `${x + px},${y + py}`).join(" ");
                return <polyline key={key} points={pts} stroke={stroke} fill="none" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
              }
              if (el.type === "freedraw" && el.points && el.points.length > 0) {
                const path = el.points.length === 1
                  ? `M ${x + el.points[0][0]} ${y + el.points[0][1]} L ${x + el.points[0][0]} ${y + el.points[0][1]}`
                  : el.points.map(([px, py], idx) => `${idx === 0 ? "M" : "L"} ${x + px} ${y + py}`).join(" ");
                return <path key={key} d={path} stroke={stroke} fill="none" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
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
        </div>
      </div>
    );
  }

  return (
    <div className="storage-tile-preview storage-canvas-preview">
      <div className="canvas-preview-header">
        <div className="canvas-preview-badge">
          <Pencil size={11} />
          <b>CANVAS</b>
        </div>
      </div>
      <div className="canvas-preview-blank">
        <div className="canvas-empty-icon-wrap">
          <Pencil size={18} />
        </div>
        <div className="canvas-preview-empty-text">Empty canvas</div>
      </div>
    </div>
  );
}

export function StorageCanvases({
  accessToken,
  filter,
  search,
  sourceChatId,
  userId
}: {
  accessToken: string | null;
  filter: StorageFilter;
  search: string;
  sourceChatId?: string | null;
  userId?: string;
}) {
  const navigate = useNavigate();
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [documents, setDocuments] = useState<Record<string, CachedCanvasPreview<CanvasUpdate>>>({});
  const [hasRestoredPreviewCache, setHasRestoredPreviewCache] = useState(!userId);
  const requestedDocuments = useRef(new Set<string>());

  useEffect(() => {
    requestedDocuments.current.clear();
    setDocuments({});
    if (!userId) {
      setHasRestoredPreviewCache(true);
      return;
    }
    let cancelled = false;
    setHasRestoredPreviewCache(false);
    void loadCachedCanvasPreviews<CanvasUpdate>(userId)
      .then((cached) => {
        if (!cancelled && cached) setDocuments(cached);
      })
      .finally(() => {
        if (!cancelled) setHasRestoredPreviewCache(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !hasRestoredPreviewCache) return;
    void saveCachedCanvasPreviews(userId, documents);
  }, [documents, hasRestoredPreviewCache, userId]);

  useEffect(() => {
    if (!accessToken) return;
    void getStorageCanvases(accessToken)
      .then((data) => setCanvases(Array.isArray(data) ? data : []))
      .catch(() => setCanvases([]));
  }, [accessToken, filter]);

  useEffect(() => {
    if (!accessToken || canvases.length === 0 || !hasRestoredPreviewCache) return;
    let cancelled = false;
    canvases.forEach((c) => {
      const requestKey = `${c.id}:${c.updatedAt}`;
      if (requestedDocuments.current.has(requestKey)) return;
      requestedDocuments.current.add(requestKey);
      void getCanvasDocument(accessToken, c.id)
        .then((res) => {
          if (!cancelled && res?.updates) {
            setDocuments((prev) => ({
              ...prev,
              [c.id]: { updatedAt: c.updatedAt, updates: res.updates }
            }));
          }
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canvases, hasRestoredPreviewCache]);

  if (filter !== "all" && filter !== "canvases") return null;

  const rawQuery = search.trim().toLowerCase();
  const isExtensionOnly =
    rawQuery === ".canvas" ||
    rawQuery === "*.canvas" ||
    rawQuery === "canvas" ||
    rawQuery === "ext:canvas" ||
    rawQuery === "type:canvas";

  const strippedQuery = rawQuery.endsWith(".canvas")
    ? rawQuery.slice(0, -".canvas".length).replace(/^\*\.?/, "").trim()
    : rawQuery.startsWith("canvas:")
    ? rawQuery.slice("canvas:".length).trim()
    : rawQuery.startsWith("ext:canvas")
    ? rawQuery.slice("ext:canvas".length).trim()
    : rawQuery;

  const visible = canvases.filter((canvas) => {
    if (
      sourceChatId &&
      canvas.originChatId !== sourceChatId &&
      !canvas.linkedChatIds?.includes(sourceChatId)
    ) {
      return false;
    }
    if (!rawQuery) return true;
    if (isExtensionOnly) return true;
    const title = (canvas.title || "Untitled canvas").toLowerCase();
    const virtualFileName = `${title}.canvas`;
    return (
      title.includes(rawQuery) ||
      (strippedQuery !== "" && title.includes(strippedQuery)) ||
      virtualFileName.includes(rawQuery)
    );
  });

  if (visible.length === 0 && filter !== "canvases" && !isExtensionOnly) return null;

  return (
    <section className="storage-canvas-section" aria-label="Canvases">
      <div className="storage-files-heading"><h2>Canvases</h2></div>
      {visible.length > 0 ? (
        <div className="storage-grid">
          {visible.map((canvas) => (
            <button
              type="button"
              className="storage-tile storage-canvas-tile"
              key={canvas.id}
              onClick={() => navigate(`${getClusterPrefix()}/app/canvas/${encodeURIComponent(canvas.id)}`)}
            >
              <CanvasTilePreview canvas={canvas} updates={documents[canvas.id]?.updates} />
              <div className="storage-tile-info">
                <strong>{canvas.title}</strong>
                <small>Canvas</small>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state storage-empty-state">
          <StickyNote size={30} />
          <strong>No canvases yet</strong>
        </div>
      )}
    </section>
  );
}
