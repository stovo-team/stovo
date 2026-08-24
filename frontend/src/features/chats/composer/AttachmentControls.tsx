import { Paperclip } from "lucide-react";

import AttachmentPickerSheet from "../../../components/AttachmentPickerSheet";
import {
  AUDIO_ATTACHMENT_ACCEPT,
  CAMERA_ATTACHMENT_ACCEPT,
  DESKTOP_ATTACHMENT_ACCEPT,
  DOCUMENT_ATTACHMENT_ACCEPT,
  GALLERY_ATTACHMENT_ACCEPT
} from "../../../attachmentAccept";
import { useComposerAttachmentContext } from "./ComposerAttachmentContext";

export function AttachmentControls() {
  const {
    disabled,
    isAttachmentSheetOpen,
    previewMediaItem,
    onPreviewMediaItemChange,
    attachmentInputRef,
    galleryAttachmentInputRef,
    cameraAttachmentInputRef,
    audioAttachmentInputRef,
    documentAttachmentInputRef,
    onAttachButtonClick,
    onFileSelect,
    onCloseSheet,
    onPickOption,
    onSelectDirectFiles,
    onSendSelectedFiles,
    composer,
    onComposerChange,
    resolvedThemeMode,
    onEnlargeComposer,
    isUploading,
    isSendingMessage
  } = useComposerAttachmentContext();
  return (
    <>
      <button
        type="button"
        className="file-picker"
        aria-label="Attach files"
        title="Attach files"
        disabled={disabled}
        onClick={onAttachButtonClick}
      >
        <Paperclip aria-hidden="true" size={22} />
      </button>
      <input
        ref={attachmentInputRef}
        accept={DESKTOP_ATTACHMENT_ACCEPT}
        className="visually-hidden"
        disabled={disabled}
        multiple
        type="file"
        onChange={onFileSelect}
      />
      <input
        ref={galleryAttachmentInputRef}
        accept={GALLERY_ATTACHMENT_ACCEPT}
        className="visually-hidden"
        disabled={disabled}
        multiple
        type="file"
        onChange={onFileSelect}
      />
      <input
        ref={cameraAttachmentInputRef}
        accept={CAMERA_ATTACHMENT_ACCEPT}
        capture="environment"
        className="visually-hidden"
        disabled={disabled}
        type="file"
        onChange={onFileSelect}
      />
      <input
        ref={audioAttachmentInputRef}
        accept={AUDIO_ATTACHMENT_ACCEPT}
        className="visually-hidden"
        disabled={disabled}
        multiple
        type="file"
        onChange={onFileSelect}
      />
      <input
        ref={documentAttachmentInputRef}
        accept={DOCUMENT_ATTACHMENT_ACCEPT}
        className="visually-hidden"
        disabled={disabled}
        multiple
        type="file"
        onChange={onFileSelect}
      />
      <AttachmentPickerSheet
        open={isAttachmentSheetOpen}
        previewMediaItem={previewMediaItem}
        onPreviewMediaItemChange={onPreviewMediaItemChange}
        onClose={onCloseSheet}
        onPick={onPickOption}
        onSelectFiles={onSelectDirectFiles}
        onSendSelectedFiles={onSendSelectedFiles}
        composer={composer}
        onComposerChange={onComposerChange}
        resolvedThemeMode={resolvedThemeMode}
        onEnlargeComposer={onEnlargeComposer}
        isUploading={isUploading}
        isSendingMessage={isSendingMessage}
      />
    </>
  );
}
