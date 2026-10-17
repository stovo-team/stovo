import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppStrings } from "../config/strings";
import type { FamilyFile } from "../api/files";
import type { StorageCollection } from "../api/collections";

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
import { getCollections } from "../api/collections";

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

  it("groups folders by their source chat and keeps chatless folders separate", async () => {
    const collection = (id: string, title: string, coverFileId: string | null): StorageCollection => ({
      id, familyId: "family-1", ownerId: "user-1", title, displayKind: "folder", contentType: "mixed", customFileTypes: "",
      coverFileId, itemCount: 1, accessLevel: "editor", createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z",
    });
    const sourceFile: FamilyFile = {
      id: "cover-1", familyId: "family-1", uploadedBy: "user-1", chatId: "chat-planning", chatTitle: "Planning Team", chatType: "group",
      originMessageId: "message-1", accessScope: "chat", storageProvider: "local", originalName: "cover.jpg", mimeType: "image/jpeg", sizeBytes: 10,
      checksum: null, createdAt: "2026-09-08T00:00:00.000Z", deletedAt: null, isFavorite: false,
    };
    vi.mocked(getCollections).mockResolvedValue([collection("folder-chat", "Planning files", sourceFile.id), collection("folder-shared", "Shared notes", null)]);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => {
      root.render(<MemoryRouter><StorageCollections accessToken="token" files={[sourceFile]} filter="all" currentUserId="user-1" groupByChat groupFallbackLabel="Shared folders" /></MemoryRouter>);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(host.querySelectorAll(".storage-collection-group")).toHaveLength(2);
    expect(host.querySelector('[data-chat-group="Planning Team"]')?.textContent).toContain("Planning files");
    expect(host.querySelector('[data-chat-group="Shared folders"]')?.textContent).toContain("Shared notes");
  });
});
