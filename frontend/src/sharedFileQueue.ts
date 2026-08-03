export type QueuedSharedFiles = {
  files: File[];
  skippedCount: number;
};

let queued: QueuedSharedFiles | null = null;
const listeners = new Set<(incoming: QueuedSharedFiles) => void>();

export function queueSharedFiles(incoming: QueuedSharedFiles) {
  if (incoming.files.length === 0 && incoming.skippedCount === 0) {
    return;
  }
  queued = queued
    ? {
        files: [...queued.files, ...incoming.files],
        skippedCount: queued.skippedCount + incoming.skippedCount
      }
    : incoming;
  listeners.forEach((listener) => listener(incoming));
}

export function onSharedFilesQueued(listener: (incoming: QueuedSharedFiles) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function takeQueuedSharedFiles(): QueuedSharedFiles | null {
  const result = queued;
  queued = null;
  return result;
}

export function clearQueuedSharedFiles() {
  queued = null;
}
