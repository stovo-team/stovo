import { Image, Video, X } from "lucide-react";

import type { PendingLocalAttachment } from "../shared/types";

export function PendingAttachmentCard({
  pending,
  onRemove
}: {
  pending: PendingLocalAttachment;
  onRemove: () => void;
}) {
  const { file, previewUrl } = pending;
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const showThumb = isImage || isVideo;

  if (showThumb) {
    return (
      <article className="pending-attachment-card pending-attachment-card--thumb">
        <div className="pending-attachment-thumb" aria-hidden={true}>
          {previewUrl ? (
            isVideo ? (
              <video src={previewUrl} muted playsInline preload="metadata" />
            ) : (
              <img src={previewUrl} alt="" />
            )
          ) : (
            <span className="pending-attachment-thumb-placeholder">
              {isVideo ? <Video aria-hidden="true" size={22} /> : <Image aria-hidden="true" size={22} />}
            </span>
          )}
        </div>
        <button
          type="button"
          className="pending-attachment-remove"
          aria-label={`Remove ${file.name}`}
          onClick={onRemove}
        >
          <X aria-hidden="true" size={14} />
        </button>
      </article>
    );
  }

  return (
    <article className="pending-attachment-card pending-attachment-card--file">
      <div className="pending-attachment-copy">
        <strong title={file.name}>{file.name}</strong>
      </div>
      <button
        type="button"
        className="pending-attachment-remove"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
      >
        <X aria-hidden="true" size={14} />
      </button>
    </article>
  );
}
