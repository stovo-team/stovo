import { useEffect, useState } from "react";
import { ExternalLink, LockKeyhole } from "lucide-react";
import type { CanvasReference, CanvasUpdate } from "../../../api/canvas";
import { getCanvasDocument } from "../../../api/canvas";
import { RichCanvasPreview } from "../../../components/RichCanvasPreview";

export interface CanvasCardBubbleProps {
  canvas: CanvasReference;
  accessToken: string | null;
  onOpenCanvas: () => void;
}

export function CanvasCardBubble({
  canvas,
  accessToken,
  onOpenCanvas,
}: CanvasCardBubbleProps) {
  const [updates, setUpdates] = useState<CanvasUpdate[] | undefined>(undefined);

  useEffect(() => {
    if (!accessToken || !canvas.available) return;
    let cancelled = false;
    getCanvasDocument(accessToken, canvas.id)
      .then((res) => {
        if (!cancelled && res?.updates) {
          setUpdates(res.updates);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken, canvas.available, canvas.id]);

  if (!canvas.available) {
    return (
      <div className="canvas-card-bubble" role="region" aria-label="Canvas">
        <div className="canvas-card-bubble-locked">
          <LockKeyhole size={18} />
          <span>Canvas unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="canvas-card-bubble"
      role="region"
      tabIndex={0}
      aria-label={`Canvas: ${canvas.title}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpenCanvas();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onOpenCanvas();
        }
      }}
    >
      <div className="canvas-card-bubble-header">
        <div className="canvas-card-bubble-header-left">
          <div className="canvas-card-bubble-icon-badge" aria-hidden="true">
            <span className="canvas-card-bubble-icon-letter">T</span>
          </div>
          <div className="canvas-card-bubble-meta">
            <span className="canvas-card-bubble-title" title={canvas.title}>
              {canvas.title}
            </span>
            <span className="canvas-card-bubble-subtitle">
              View Markdown in Canvas
            </span>
          </div>
        </div>
        <button
          type="button"
          className="canvas-card-bubble-open-btn"
          aria-label={`Open ${canvas.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenCanvas();
          }}
        >
          <span className="canvas-card-bubble-open">Open</span>
          <ExternalLink size={13} strokeWidth={2.4} />
        </button>
      </div>
      <div className="canvas-card-bubble-preview">
        <RichCanvasPreview canvas={canvas} updates={updates} hideHeader />
      </div>
    </div>
  );
}
