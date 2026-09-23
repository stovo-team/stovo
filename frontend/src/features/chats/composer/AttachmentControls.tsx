import { useRef } from "react";
import { Paperclip } from "lucide-react";

import AttachmentPickerSheet from "../../../components/AttachmentPickerSheet";
import { useComposerAttachmentContext } from "./ComposerAttachmentContext";

export function AttachmentControls() {
  const attachmentButtonRef = useRef<HTMLButtonElement | null>(null);
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
    isSendingMessage,
    onCreatePoll,
    onCreateCanvas,
    onCreateChecklist,
    attachmentSheetInitialTab
  } = useComposerAttachmentContext();
  return (
    <>
      <button
        ref={attachmentButtonRef}
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
        className="visually-hidden"
        disabled={disabled}
        multiple
        type="file"
        onChange={onFileSelect}
      />
      <input
        ref={galleryAttachmentInputRef}
        className="visually-hidden"
        disabled={disabled}
        multiple
        type="file"
        onChange={onFileSelect}
      />
      <input
        ref={cameraAttachmentInputRef}
        capture="environment"
        className="visually-hidden"
        disabled={disabled}
        type="file"
        onChange={onFileSelect}
      />
      <input
        ref={audioAttachmentInputRef}
        className="visually-hidden"
        disabled={disabled}
        multiple
        type="file"
        onChange={onFileSelect}
      />
      <input
        ref={documentAttachmentInputRef}
        className="visually-hidden"
        disabled={disabled}
        multiple
        type="file"
        onChange={onFileSelect}
      />
      <AttachmentPickerSheet
        anchorRef={attachmentButtonRef}
        open={isAttachmentSheetOpen}
        initialTab={attachmentSheetInitialTab}
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
        onCreatePoll={onCreatePoll}
        onCreateCanvas={onCreateCanvas}
        onCreateChecklist={onCreateChecklist}
      />
    </>
  );
}
