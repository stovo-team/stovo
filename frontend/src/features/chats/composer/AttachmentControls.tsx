import { ChangeEvent, RefObject } from "react";
import { Paperclip } from "lucide-react";

import AttachmentPickerSheet, { AttachmentPickerOption } from "../../../components/AttachmentPickerSheet";
import {
  AUDIO_ATTACHMENT_ACCEPT,
  CAMERA_ATTACHMENT_ACCEPT,
  DESKTOP_ATTACHMENT_ACCEPT,
  DOCUMENT_ATTACHMENT_ACCEPT,
  GALLERY_ATTACHMENT_ACCEPT
} from "../../../attachmentAccept";

export function AttachmentControls({
  disabled,
  isAttachmentSheetOpen,
  attachmentInputRef,
  galleryAttachmentInputRef,
  cameraAttachmentInputRef,
  audioAttachmentInputRef,
  documentAttachmentInputRef,
  onAttachButtonClick,
  onFileSelect,
  onCloseSheet,
  onPickOption,
  onSelectDirectFiles
}: {
  disabled: boolean;
  isAttachmentSheetOpen: boolean;
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  galleryAttachmentInputRef: RefObject<HTMLInputElement | null>;
  cameraAttachmentInputRef: RefObject<HTMLInputElement | null>;
  audioAttachmentInputRef: RefObject<HTMLInputElement | null>;
  documentAttachmentInputRef: RefObject<HTMLInputElement | null>;
  onAttachButtonClick: () => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onCloseSheet: () => void;
  onPickOption: (option: AttachmentPickerOption) => void;
  onSelectDirectFiles?: (files: File[]) => void;
}) {
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
        onClose={onCloseSheet}
        onPick={onPickOption}
        onSelectFiles={onSelectDirectFiles}
      />
    </>
  );
}
