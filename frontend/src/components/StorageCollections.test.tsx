import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppStrings } from "../config/strings";

vi.mock("../api/collections", () => ({
  addCollectionItem: vi.fn(), createCollection: vi.fn(), deleteCollection: vi.fn(), deleteCollectionGrant: vi.fn(),
  getCollectionGrants: vi.fn(async () => []), getCollectionItems: vi.fn(async () => []), getCollections: vi.fn(async () => []),
  removeCollectionItem: vi.fn(), saveCollectionGrant: vi.fn(), updateCollection: vi.fn(),
}));
vi.mock("../api/family", () => ({ getMembers: vi.fn(async () => []), getServerRoles: vi.fn(async () => []) }));
vi.mock("../api/chats", () => ({ getChats: vi.fn(async () => []), sendCollectionMessage: vi.fn() }));
vi.mock("../api/files", () => ({ downloadFileBlob: vi.fn(), formatFileSize: () => "0 B", uploadFile: vi.fn() }));
vi.mock("../fileLibraryCache", () => ({ loadCachedStorageItemsFromLocalStorage: () => [], saveCachedStorageItems: vi.fn(async () => undefined) }));
vi.mock("../hooks/useFilePreviewUrl", () => ({ default: () => null }));
vi.mock("../mediaBlobCache", () => ({ peekCachedObjectUrl: () => null }));
vi.mock("../features/chats/conversation/MessageDialogs", () => ({ ForwardChatDialog: () => null }));
vi.mock("../i18n/LanguageContext", () => ({ useStrings: () => getAppStrings("ru") }));

import { StorageCollections } from "./StorageCollections";

const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("StorageCollections localization", () => {
  it("renders Russian collection creation and file type controls", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
      root.render(<MemoryRouter><StorageCollections accessToken="token" files={[]} filter="all" currentUserId="user-1" /></MemoryRouter>);
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".storage-collection-new")?.click();
    });
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>(".popup-select__trigger")?.click();
    });

    expect(host.textContent).toContain("Новая папка или альбом");
    expect(host.textContent).toContain("Создать");
    expect(document.body.querySelector("[role='option'][data-value='album']")?.textContent).toContain("Фотоальбом");
  });
});
