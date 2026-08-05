import { useCallback, useEffect, useState } from "react";

import { onSharedFilesQueued, takeQueuedSharedFiles, type QueuedSharedFiles } from "../../../sharedFileQueue";

export type UseSharedFileQueueBridgeParams = {
  chatId: string | undefined;
  addSharedFileAttachments: (files: File[]) => void;
  onError: (message: string | null) => void;
};

/**
 * Bridges files shared into the app from the OS share sheet (queued before
 * ChatsPage mounts, or while it's already open) into the composer's pending
 * attachments once a chat is active.
 */
export function useSharedFileQueueBridge({ chatId, addSharedFileAttachments, onError }: UseSharedFileQueueBridgeParams) {
  const [incomingSharedFiles, setIncomingSharedFiles] = useState<QueuedSharedFiles | null>(null);

  const receiveSharedFiles = useCallback(
    (queued: QueuedSharedFiles) => {
      setIncomingSharedFiles(queued);
      if (queued.skippedCount > 0) {
        onError(`${queued.skippedCount} unsupported ${queued.skippedCount === 1 ? "file was" : "files were"} skipped.`);
      }
    },
    [onError]
  );

  useEffect(() => {
    const queued = takeQueuedSharedFiles();
    if (queued) {
      receiveSharedFiles(queued);
    }
  }, [receiveSharedFiles]);

  useEffect(
    () =>
      onSharedFilesQueued(() => {
        const queued = takeQueuedSharedFiles();
        if (queued) {
          receiveSharedFiles(queued);
        }
      }),
    [receiveSharedFiles]
  );

  useEffect(() => {
    if (!chatId || !incomingSharedFiles) {
      return;
    }
    addSharedFileAttachments(incomingSharedFiles.files);
    setIncomingSharedFiles(null);
  }, [chatId, incomingSharedFiles, addSharedFileAttachments]);

  return { incomingSharedFiles };
}
