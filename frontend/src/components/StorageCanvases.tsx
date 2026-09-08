import { useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getClusterPrefix } from "../api/client";
import { getStorageCanvases, type Canvas } from "../api/canvas";
import type { StorageFilter } from "../pages/storageLibrary";

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

  useEffect(() => {
    if (!accessToken) return;
    void getStorageCanvases(accessToken)
      .then((data) => setCanvases(Array.isArray(data) ? data : []))
      .catch(() => setCanvases([]));
  }, [accessToken, filter]);

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
              <span className="storage-canvas-tile-icon"><StickyNote size={28} /></span>
              <span><strong>{canvas.title}</strong><small>Canvas • .canvas</small></span>
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
