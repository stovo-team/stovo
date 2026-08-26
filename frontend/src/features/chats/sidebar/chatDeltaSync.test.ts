import { beforeEach, describe, expect, it, vi } from "vitest";

const getSyncPage = vi.fn();
const getFile = vi.fn();
const loadRecentChatHistory = vi.fn();
const saveRecentChatHistory = vi.fn();
const loadCachedFileList = vi.fn();
const saveCachedFileList = vi.fn();
const getNativeReplicaSyncCursor = vi.fn();
const saveNativeReplicaSyncCursor = vi.fn();

vi.mock("../../../api/sync", () => ({ getSyncPage }));
vi.mock("../../../api/files", () => ({ getFile }));
vi.mock("../../../chatHistoryCache", () => ({
  loadRecentChatHistory,
  mergeLatestHistory: (current: Array<{ id: string }>, incoming: Array<{ id: string }>) => [
    ...current.filter((item) => !incoming.some((next) => next.id === item.id)),
    ...incoming,
  ],
  saveRecentChatHistory,
}));
vi.mock("../../../fileLibraryCache", () => ({ loadCachedFileList, saveCachedFileList }));
vi.mock("../../../native/localReplicaPlugin", () => ({
  isAndroidLocalReplicaPlatform: () => true,
  getNativeReplicaSyncCursor,
  saveNativeReplicaSyncCursor,
}));

describe("syncChatReplicaDeltas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getNativeReplicaSyncCursor.mockResolvedValue("cursor-0");
    loadRecentChatHistory.mockResolvedValue([]);
    saveRecentChatHistory.mockResolvedValue(undefined);
    loadCachedFileList.mockResolvedValue([]);
    saveCachedFileList.mockResolvedValue(undefined);
    getFile.mockResolvedValue({ id: "file-1", createdAt: "2026-08-26T00:00:00Z" });
    saveNativeReplicaSyncCursor.mockResolvedValue(true);
  });

  it("persists chat and file deltas before acknowledging the page cursor", async () => {
    getSyncPage.mockResolvedValue({
      events: [
        { type: "message.created", payload: { id: "message-1", chatId: "chat-1" } },
        { type: "file.changed", payload: { fileId: "file-1" } },
      ],
      nextCursor: "cursor-1",
      hasMore: false,
    });
    const { syncChatReplicaDeltas } = await import("./chatDeltaSync");

    await syncChatReplicaDeltas({ accessToken: "token", userId: "user-1" });

    expect(saveRecentChatHistory).toHaveBeenCalledWith(
      "user-1", "chat-1", [{ id: "message-1", chatId: "chat-1" }],
    );
    expect(getFile).toHaveBeenCalledWith("token", "file-1");
    expect(saveCachedFileList).toHaveBeenCalledWith(
      "user-1", [{ id: "file-1", createdAt: "2026-08-26T00:00:00Z" }],
    );
    expect(saveNativeReplicaSyncCursor).toHaveBeenCalledWith("user-1", "cursor-1");
    expect(saveCachedFileList.mock.invocationCallOrder[0])
      .toBeLessThan(saveNativeReplicaSyncCursor.mock.invocationCallOrder[0]);
  });
});
