import { useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as Y from "yjs";

import { getClusterPrefix } from "../api/client";
import { getCanvasDocument, getStorageCanvases, type Canvas, type CanvasUpdate } from "../api/canvas";
import type { StorageFilter } from "../pages/storageLibrary";

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

function parseCanvasDocument(updates?: CanvasUpdate[]): {
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
      if (kind === "markdown" && !markdown) {
        const text = (record.get("content") as Y.Text)?.toString() || "";
        if (text.trim()) markdown = text.trim();
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

function CanvasTilePreview({
  canvas,
  updates
}: {
  canvas: Canvas;
  updates?: CanvasUpdate[];
}) {
  const { markdown, whiteboardElements } = parseCanvasDocument(updates);
  const activeElements = whiteboardElements.filter((el) => !el.isDeleted);

  if (activeElements.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of activeElements) {
      const x = el.x ?? 0;
      const y = el.y ?? 0;
      const w = el.width ?? 0;
      const h = el.height ?? 0;
      minX = Math.min(minX, x, x + w);
      minY = Math.min(minY, y, y + h);
      maxX = Math.max(maxX, x, x + w);
      maxY = Math.max(maxY, y, y + h);
      if (el.points && Array.isArray(el.points)) {
        for (const [px, py] of el.points) {
          minX = Math.min(minX, x + px);
          minY = Math.min(minY, y + py);
          maxX = Math.max(maxX, x + px);
          maxY = Math.max(maxY, y + py);
        }
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

    const width = Math.max(maxX - minX, 40);
    const height = Math.max(maxY - minY, 40);
    const pad = Math.max(width, height) * 0.15;
    const viewBox = `${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`;

    return (
      <div className="storage-tile-preview storage-canvas-preview">
        <svg viewBox={viewBox} className="canvas-preview-svg" aria-hidden="true">
          {activeElements.map((el, i) => {
            const stroke = el.strokeColor && el.strokeColor !== "transparent" ? el.strokeColor : "#818cf8";
            const fill = el.backgroundColor && el.backgroundColor !== "transparent" ? el.backgroundColor : "rgba(129, 140, 248, 0.16)";
            const sw = Math.max(el.strokeWidth || 1.5, 1);
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
                />
              );
            }
            if (el.type === "diamond") {
              const midX = x + w / 2;
              const midY = y + h / 2;
              const pts = `${midX},${y} ${x + w},${midY} ${midX},${y + h} ${x},${midY}`;
              return <polygon key={key} points={pts} stroke={stroke} fill={fill} strokeWidth={sw} />;
            }
            if ((el.type === "line" || el.type === "arrow") && el.points && el.points.length > 1) {
              const pts = el.points.map(([px, py]) => `${x + px},${y + py}`).join(" ");
              return <polyline key={key} points={pts} stroke={stroke} fill="none" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
            }
            if (el.type === "freedraw" && el.points && el.points.length > 0) {
              const path = el.points.map(([px, py], idx) => `${idx === 0 ? "M" : "L"} ${x + px} ${y + py}`).join(" ");
              return <path key={key} d={path} stroke={stroke} fill="none" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
            }
            if (el.type === "text" && el.text) {
              return (
                <text
                  key={key}
                  x={x}
                  y={y + (el.fontSize || 14)}
                  fill={stroke}
                  fontSize={el.fontSize || 14}
                  fontFamily="sans-serif"
                >
                  {el.text}
                </text>
              );
            }
            return null;
          })}
        </svg>
      </div>
    );
  }

  if (markdown) {
    const rawLines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);
    const displayLines = rawLines
      .filter((line, index) => {
        if (index === 0 && rawLines.length > 1) {
          const stripped = line.replace(/^#{1,6}\s*/, "").trim();
          if (stripped.toLowerCase() === canvas.title.toLowerCase()) {
            return false;
          }
        }
        return true;
      })
      .slice(0, 3);

    if (displayLines.length > 0) {
      return (
        <div className="storage-tile-preview storage-canvas-preview">
          <div className="canvas-preview-doc">
            {displayLines.map((line, idx) => {
              const isHeading = /^#{1,6}\s+/.test(line);
              const isBullet = /^[-*+]\s+/.test(line);
              const cleanText = line.replace(/^(#{1,6}|[-*+])\s+/, "");
              if (isHeading) {
                return (
                  <div key={idx} className="canvas-preview-doc-heading">
                    {cleanText}
                  </div>
                );
              }
              if (isBullet) {
                return (
                  <div key={idx} className="canvas-preview-doc-bullet">
                    <span>{cleanText}</span>
                  </div>
                );
              }
              return (
                <div key={idx} className="canvas-preview-doc-line">
                  {cleanText}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  }

  return (
    <div className="storage-tile-preview storage-canvas-preview">
      <div className="canvas-preview-blank">
        <div className="canvas-preview-mock-shape" />
        <span className="canvas-preview-mock-tag">Canvas</span>
      </div>
    </div>
  );
}

export function StorageCanvases({
  accessToken,
  filter,
  search,
  sourceChatId
}: {
  accessToken: string | null;
  filter: StorageFilter;
  search: string;
  sourceChatId?: string | null;
}) {
  const navigate = useNavigate();
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [documents, setDocuments] = useState<Record<string, CanvasUpdate[]>>({});

  useEffect(() => {
    if (!accessToken) return;
    void getStorageCanvases(accessToken)
      .then((data) => setCanvases(Array.isArray(data) ? data : []))
      .catch(() => setCanvases([]));
  }, [accessToken, filter]);

  useEffect(() => {
    if (!accessToken || canvases.length === 0) return;
    let cancelled = false;
    canvases.forEach((c) => {
      if (documents[c.id]) return;
      void getCanvasDocument(accessToken, c.id)
        .then((res) => {
          if (!cancelled && res?.updates) {
            setDocuments((prev) => ({ ...prev, [c.id]: res.updates }));
          }
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canvases]);

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
              <CanvasTilePreview canvas={canvas} updates={documents[canvas.id]} />
              <span className="storage-tile-info">
                <strong>{canvas.title}</strong>
                <small>Canvas • .canvas</small>
              </span>
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
