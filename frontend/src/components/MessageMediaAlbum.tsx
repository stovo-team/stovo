import type { ReactNode } from "react";

import type { FamilyFile } from "../api/files";
import { audioPlaybackSession } from "../audioPlaybackSession";
import { mediaAlbumLayoutCount } from "../messageMediaAlbum";
import { VideoPlayer } from "./VideoPlayer";
import { useStrings } from "../i18n/LanguageContext";

export {
  isMediaAttachment,
  mediaAlbumLayoutCount,
  partitionMessageAttachments
} from "../messageMediaAlbum";

export type MessageMediaAlbumProps = {
  accessToken: string | null;
  chatId: string;
  messageId: string;
  files: FamilyFile[];
  disabledReason?: string;
  videoAutoplay?: boolean;
  renderImage: (file: FamilyFile) => ReactNode;
};

export default function MessageMediaAlbum({
  accessToken,
  chatId,
  messageId,
  files,
  disabledReason,
  videoAutoplay = true,
  renderImage
}: MessageMediaAlbumProps) {
  const copy = useStrings().auditUi;
  const count = files.length;
  if (count === 0) {
    return null;
  }

  const layoutCount = mediaAlbumLayoutCount(count);

  return (
    <div
      className="message-media-album"
      data-count={layoutCount}
      data-items={count}
      role="group"
      aria-label={copy.mediaAttachmentCount(count)}
    >
      {files.map((file) => {
        const isVideo = file.mimeType.startsWith("video/");
        return (
          <div className="message-media-album-cell" key={file.id}>
            {isVideo ? (
              <article className="message-video-attachment message-video-attachment--album">
                <VideoPlayer
                  accessToken={accessToken ?? ""}
                  file={file}
                  identity={{ chatId, messageId, fileId: file.id }}
                  disabledReason={disabledReason}
                  beforePlay={() => audioPlaybackSession.pauseForVideo()}
                  autoplay={videoAutoplay}
                />
              </article>
            ) : (
              renderImage(file)
            )}
          </div>
        );
      })}
    </div>
  );
}
