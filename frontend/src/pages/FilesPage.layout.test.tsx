import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import FilesPage from "./FilesPage";

const mocks = vi.hoisted(() => ({ authRequest: vi.fn(async (path: string) => path === "/api/family" ? {} : []) }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ accessToken: "test-token", currentUser: { id: "user-1" }, authRequest: mocks.authRequest }) }));
vi.mock("../api/chats", () => ({ getChats: vi.fn(async () => []) }));
vi.mock("../api/files", () => ({ createStreamingMediaUrl: vi.fn(), formatFileSize: () => "", saveFileToDisk: vi.fn(), updateFilePreferences: vi.fn(), uploadFile: vi.fn() }));
vi.mock("../components/AudioPlayer", () => ({ AudioPlayer: () => null }));
vi.mock("../components/DocumentAttachmentPreview", () => ({ DocumentAttachmentPreview: () => null, detectDocumentPreviewKind: () => "unsupported" }));
vi.mock("../components/ImageLightbox", () => ({ default: () => null }));
vi.mock("../components/VideoPlayer", () => ({ VideoPlayer: () => null }));
vi.mock("../components/StorageCollections", () => ({ StorageCollections: () => null }));
vi.mock("../components/StorageCanvases", () => ({ StorageCanvases: () => null }));
vi.mock("../components/StorageChecklists", () => ({ StorageChecklists: () => null }));
vi.mock("../hooks/useFilePreviewUrl", () => ({ default: () => null }));
vi.mock("./AppNav", () => ({ default: () => null }));
vi.mock("../i18n/LanguageContext", async () => {
  const { getAppStrings } = await import("../config/strings");
  return { useStrings: () => getAppStrings("en"), useResolvedLanguage: () => "en" };
});
vi.mock("../fileLibraryCache", () => ({ loadCachedFileList: vi.fn(async () => null), loadCachedStorageItemsFromLocalStorage: vi.fn(() => []), saveCachedFileList: vi.fn() }));
vi.mock("../chatHistoryCache", () => ({ loadCachedChatListFromLocalStorage: vi.fn(() => []), saveCachedChatList: vi.fn() }));
vi.mock("../features/chats/sidebar/chatDeltaSync", () => ({ syncChatReplicaDeltas: vi.fn(async () => undefined) }));

const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
});

describe("FilesPage source list collapse", () => {
  it("collapses and restores the source picker without changing the selected chat", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<MemoryRouter><FilesPage /></MemoryRouter>);
      await Promise.resolve();
    });

    const layout = host.querySelector(".storage-layout");
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Collapse chat list"]');
    expect(toggle).not.toBeNull();
    await act(async () => toggle?.click());
    expect(layout?.classList.contains("storage-layout--source-collapsed")).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Expand chat list"]')?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Expand chat list"]')?.click());
    expect(layout?.classList.contains("storage-layout--source-collapsed")).toBe(false);
    expect(host.querySelector(".storage-source.active")?.textContent).toContain("All chats");
  });
});
