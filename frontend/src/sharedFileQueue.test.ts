import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearQueuedSharedFiles,
  onSharedFilesQueued,
  queueSharedFiles,
  takeQueuedSharedFiles
} from "./sharedFileQueue";

describe("shared file queue", () => {
  beforeEach(() => clearQueuedSharedFiles());

  it("combines consecutive share batches until the chat picker consumes them", () => {
    const first = new File(["a"], "first.pdf", { type: "application/pdf" });
    const second = new File(["b"], "second.jpg", { type: "image/jpeg" });

    queueSharedFiles({ files: [first], skippedCount: 1 });
    queueSharedFiles({ files: [second], skippedCount: 2 });

    expect(takeQueuedSharedFiles()).toEqual({
      files: [first, second],
      skippedCount: 3
    });
    expect(takeQueuedSharedFiles()).toBeNull();
  });

  it("notifies an active chat screen when Android shares a new batch", () => {
    const received = vi.fn();
    const unsubscribe = onSharedFilesQueued(received);
    const shared = new File(["a"], "photo.jpg", { type: "image/jpeg" });

    queueSharedFiles({ files: [shared], skippedCount: 0 });

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith({ files: [shared], skippedCount: 0 });
    unsubscribe();
  });
});
