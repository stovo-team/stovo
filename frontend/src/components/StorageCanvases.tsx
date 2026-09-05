import { useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getClusterPrefix } from "../api/client";
import { getStorageCanvases, type Canvas } from "../api/canvas";
import type { StorageFilter } from "../pages/storageLibrary";

export function StorageCanvases({ accessToken, filter, search }: { accessToken: string | null; filter: StorageFilter; search: string }) {
  const navigate = useNavigate();
  const [canvases, setCanvases] = useState<Canvas[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    void getStorageCanvases(accessToken).then(setCanvases).catch(() => setCanvases([]));
  }, [accessToken]);

  if (filter !== "all" && filter !== "canvases") return null;
  const query = search.trim().toLocaleLowerCase();
  const visible = query ? canvases.filter((canvas) => canvas.title.toLocaleLowerCase().includes(query)) : canvases;
  if (visible.length === 0 && filter !== "canvases") return null;

  return (
    <section className="storage-canvas-section" aria-label="Canvases">
      <div className="storage-files-heading"><h2>Canvases</h2></div>
      {visible.length > 0 ? <div className="storage-grid">
        {visible.map((canvas) => <button type="button" className="storage-tile storage-canvas-tile" key={canvas.id} onClick={() => navigate(`${getClusterPrefix()}/app/canvas/${encodeURIComponent(canvas.id)}`)}>
          <span className="storage-canvas-tile-icon"><StickyNote size={28} /></span>
          <span><strong>{canvas.title}</strong><small>Canvas</small></span>
        </button>)}
      </div> : <div className="empty-state storage-empty-state"><StickyNote size={30} /><strong>No canvases yet</strong></div>}
    </section>
  );
}
