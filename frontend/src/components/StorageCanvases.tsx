import { useEffect, useRef, useState } from "react";
import { StickyNote } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getClusterPrefix } from "../api/client";
import { getCanvasDocument, getStorageCanvases, type Canvas, type CanvasUpdate } from "../api/canvas";
import type { StorageFilter } from "../pages/storageLibrary";
import {
  loadCachedCanvasPreviews,
  saveCachedCanvasPreviews,
  type CachedCanvasPreview,
} from "../fileLibraryCache";
import { RichCanvasPreview } from "./RichCanvasPreview";

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
              <RichCanvasPreview canvas={canvas} updates={documents[canvas.id]?.updates} />
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
