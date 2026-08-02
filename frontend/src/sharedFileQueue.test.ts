import { beforeEach, describe, expect, it } from "vitest";

import { clearQueuedSharedFiles, queueSharedFiles, takeQueuedSharedFiles } from "./sharedFileQueue";

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
});
