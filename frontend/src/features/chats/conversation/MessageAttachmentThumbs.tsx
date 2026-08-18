import { useCallback } from "react";
import { FileText, Image } from "lucide-react";

import { downloadFileBlob, formatFileSize, saveFileToDisk } from "../../../api/files";
import type { FamilyFile } from "../../../api/files";
import { AudioPlayer } from "../../../components/AudioPlayer";
import { DocumentAttachmentPreview, detectDocumentPreviewKind } from "../../../components/DocumentAttachmentPreview";
import { VideoPlayer } from "../../../components/VideoPlayer";
import useFilePreviewUrl from "../../../hooks/useFilePreviewUrl";
import { peekCachedObjectUrl } from "../../../mediaBlobCache";
import { audioPlaybackSession, type AudioDescriptor } from "../../../audioPlaybackSession";
import { buildAudioSourceFactory } from "../shared/audioSourceFactory";
import { isImageAttachment } from "../shared/messagePresentation";

export function ComposerContextThumb({
  accessToken,
  file
}: {
  accessToken: string | null;
  file: FamilyFile | null;
}) {
  const previewUrl = useFilePreviewUrl(accessToken, file, Boolean(file));
  if (!file) {
    return null;
  }
  if (previewUrl) {
    return <img className="reply-composer-thumb" src={previewUrl} alt="" />;
  }
  return (
    <span className="reply-composer-thumb reply-composer-thumb--placeholder" aria-hidden="true" />
  );
}

export function MessageImageAttachment({
  accessToken,
  file,
  onOpenImage
}: {
  accessToken: string | null;
  file: FamilyFile;
  onOpenImage?: (file: FamilyFile, previewUrl: string) => void;
}) {
  const previewUrl = useFilePreviewUrl(accessToken, file, true);

  return (
    <button
      type="button"
      className="message-photo-attachment"
      aria-label={`Open ${file.originalName} full view`}
      disabled={!previewUrl}
      onClick={() => {
        if (previewUrl) {
          onOpenImage?.(file, previewUrl);
        }
      }}
    >
      {previewUrl ? (
        <img src={previewUrl} alt="" />
      ) : (
        <span className="message-photo-placeholder" aria-hidden="true">
          <Image size={28} />
        </span>
      )}
    </button>
  );
}

export function AttachmentCard({
  accessToken,
  chatId,
  file,
  messageId,
  disabledReason,
  onBeforeAudioPlay,
  compact = false,
  onOpenImage,
  videoAutoplay = true
}: {
  accessToken: string | null;
  chatId: string;
  file: FamilyFile;
  messageId: string;
  disabledReason?: string;
  onBeforeAudioPlay?: () => Promise<void>;
  compact?: boolean;
  onOpenImage?: (file: FamilyFile, previewUrl: string) => void;
  videoAutoplay?: boolean;
}) {
  const isImage = isImageAttachment(file);
  const isVideo = file.mimeType.startsWith("video/");
  const isAudio = file.mimeType.startsWith("audio/");
  const documentKind = detectDocumentPreviewKind(file);
  const previewUrl = useFilePreviewUrl(accessToken, file, isImage);
  const resolveAudioDurationUrl = useCallback(async () => {
    if (!accessToken?.trim()) return null;
    try {
      await downloadFileBlob(accessToken, file.id);
      return peekCachedObjectUrl(file.id);
    } catch {
      return null;
    }
  }, [accessToken, file.id]);

  if (isAudio) {
    const descriptor: AudioDescriptor = {
      identity: { chatId, messageId, fileId: file.id },
      title: file.originalName,
      mimeType: file.mimeType
    };
    return (
      <AudioPlayer
        descriptor={descriptor}
        sourceFactory={buildAudioSourceFactory(accessToken ?? "")}
        disabledReason={disabledReason}
        onBeforePlay={onBeforeAudioPlay}
        resolveDurationUrl={resolveAudioDurationUrl}
        hideTitle={file.originalName.startsWith("voice-")}
        accessToken={accessToken}
      />
    );
  }

  if (isVideo) {
    return (
      <article className="message-video-attachment">
        <VideoPlayer
          accessToken={accessToken ?? ""}
          file={file}
          identity={{ chatId, messageId, fileId: file.id }}
          disabledReason={disabledReason}
          beforePlay={() => audioPlaybackSession.pauseForVideo()}
          autoplay={videoAutoplay}
        />
      </article>
    );
  }

  if (documentKind !== "unsupported") {
    return <DocumentAttachmentPreview accessToken={accessToken} file={file} />;
  }

  if (compact && isImage) {
    return (
      <MessageImageAttachment
        accessToken={accessToken}
        file={file}
        onOpenImage={onOpenImage}
      />
    );
  }

  return (
    <article className={`attachment-card ${compact ? "compact" : ""} ${isImage ? "image-preview-card" : ""}`}>
      {isImage ? (
        <button
          type="button"
          className="attachment-preview-button"
          aria-label={`Open ${file.originalName} full view`}
          disabled={!previewUrl}
          onClick={() => {
            if (previewUrl) {
              onOpenImage?.(file, previewUrl);
            }
          }}
        >
          {previewUrl ? (
            <img src={previewUrl} alt={file.originalName} />
          ) : (
            <span className="attachment-file-icon">
              <Image aria-hidden="true" size={24} />
            </span>
          )}
        </button>
      ) : (
        <span className="attachment-file-icon">
          <FileText aria-hidden="true" size={22} />
        </span>
      )}
      <div className="attachment-copy">
        <strong>{file.originalName}</strong>
        <span>
          {file.mimeType} / {formatFileSize(file.sizeBytes)}
        </span>
      </div>
      {accessToken && (
        <button type="button" onClick={() => void saveFileToDisk(accessToken, file)}>
          Save
        </button>
      )}
    </article>
  );
}
