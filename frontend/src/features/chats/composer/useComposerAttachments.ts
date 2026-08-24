import { ChangeEvent, RefObject, useRef, useState } from "react";

import { peekCachedObjectUrl, seedMediaBlobCache } from "../../../mediaBlobCache";
import { createClientMessageId } from "../shared/messageState";
import type { PendingLocalAttachment } from "../shared/types";

function toPendingAttachment(file: File): PendingLocalAttachment {
  const localId = `local:${createClientMessageId()}`;
  try {
    seedMediaBlobCache(localId, file);
  } catch {
    // A preview cache is optional; the attachment is still usable without it.
  }
  const previewable = file.type.startsWith("image/") || file.type.startsWith("video/");
  return {
    localId,
    file,
    previewUrl: previewable ? peekCachedObjectUrl(localId) ?? URL.createObjectURL(file) : null
  };
}

export function useComposerAttachments() {
  const [pendingAttachments, setPendingAttachments] = useState<PendingLocalAttachment[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const galleryAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const cameraAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const audioAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const documentAttachmentInputRef = useRef<HTMLInputElement | null>(null);

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) setPendingAttachments((current) => [...current, ...files.map(toPendingAttachment)]);
  }

  function addSharedFileAttachments(files: File[]) {
    if (files.length) setPendingAttachments((current) => [...current, ...files.map(toPendingAttachment)]);
  }

  function removePendingAttachment(localId: string) {
    setPendingAttachments((current) => current.filter((item) => item.localId !== localId));
  }

  function updatePendingAttachment(localId: string, file: File) {
    try {
      seedMediaBlobCache(localId, file);
    } catch {
      // A preview cache is optional.
    }
    const previewable = file.type.startsWith("image/") || file.type.startsWith("video/");
    const previewUrl = previewable ? peekCachedObjectUrl(localId) ?? URL.createObjectURL(file) : null;
    setPendingAttachments((current) => current.map((item) => item.localId === localId ? { ...item, file, previewUrl } : item));
  }

  return {
    pendingAttachments,
    setPendingAttachments,
    attachmentInputRef,
    galleryAttachmentInputRef,
    cameraAttachmentInputRef,
    audioAttachmentInputRef,
    documentAttachmentInputRef,
    handleFileSelect,
    addSharedFileAttachments,
    removePendingAttachment,
    updatePendingAttachment
  };
}
