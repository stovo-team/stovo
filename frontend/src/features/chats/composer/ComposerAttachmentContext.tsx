import { ChangeEvent, createContext, ReactNode, RefObject, useContext } from "react";

import { AttachmentPickerOption } from "../../../components/AttachmentPickerSheet";
import type { NativeMediaItem } from "../../../native/mediaLibraryPlugin";

type ComposerAttachmentContextValue = {
  disabled: boolean;
  isAttachmentSheetOpen: boolean;
  previewMediaItem?: NativeMediaItem | null;
  onPreviewMediaItemChange?: (item: NativeMediaItem | null) => void;
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
  onSendSelectedFiles?: (files: File[], message: string) => void | Promise<void>;
  composer?: string;
  onComposerChange?: (value: string) => void;
  resolvedThemeMode?: "light" | "dark";
  onEnlargeComposer?: () => void;
  isUploading?: boolean;
  isSendingMessage?: boolean;
};

const ComposerAttachmentContext = createContext<ComposerAttachmentContextValue | null>(null);

export function ComposerAttachmentProvider({ children, value }: { children: ReactNode; value: ComposerAttachmentContextValue }) {
  return <ComposerAttachmentContext.Provider value={value}>{children}</ComposerAttachmentContext.Provider>;
}

export function useComposerAttachmentContext(): ComposerAttachmentContextValue {
  const context = useContext(ComposerAttachmentContext);
  if (!context) {
    throw new Error("useComposerAttachmentContext must be used within ComposerAttachmentProvider");
  }
  return context;
}
