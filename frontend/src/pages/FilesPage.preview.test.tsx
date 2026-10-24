import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FamilyFile } from "../api/files";
import FilesPage from "./FilesPage";

const mocks = vi.hoisted(() => ({
  authRequest: vi.fn(),
  files: [] as Array<Record<string, unknown>>,
  language: "en",
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ accessToken: "test-token", currentUser: { id: "member-1", role: "owner" }, authRequest: mocks.authRequest }),
}));
vi.mock("../api/chats", () => ({ getChats: vi.fn(async () => []) }));
vi.mock("../api/files", () => ({
  createStreamingMediaUrl: vi.fn(async () => "blob:video"),
  formatFileSize: (size: number) => `${size} bytes`,
  saveFileToDisk: vi.fn(),
  updateFilePreferences: vi.fn(async (_token: string, fileId: string, changes: { isFavorite: boolean }) => ({
    ...mocks.files.find((file) => file.id === fileId),
    isFavorite: changes.isFavorite,
  })),
  uploadFile: vi.fn(),
}));
vi.mock("../components/AudioPlayer", () => ({ AudioPlayer: () => <div className="audio-player" /> }));
vi.mock("../components/DocumentAttachmentPreview", () => ({
  DocumentAttachmentPreview: ({ file }: { file: FamilyFile }) => <div className="document-preview-card">{file.originalName}</div>,
  detectDocumentPreviewKind: (file: FamilyFile) => file.originalName.endsWith(".md") ? "text" : "unsupported",
}));
vi.mock("../components/ImageLightbox", () => ({ default: () => null }));
vi.mock("../components/VideoPlayer", () => ({ VideoPlayer: ({ fullViewRequest }: { fullViewRequest?: number }) => <div className="video-player" data-full-view-request={fullViewRequest} /> }));
vi.mock("../components/StorageCollections", () => ({ StorageCollections: () => null }));
vi.mock("../components/StorageCanvases", () => ({ StorageCanvases: () => null }));
vi.mock("../components/StorageChecklists", () => ({ StorageChecklists: () => null }));
vi.mock("../hooks/useFilePreviewUrl", () => ({ default: (_token: string | null, file: FamilyFile | null) => file && !file.mimeType.startsWith("video/") ? `blob:${file.id}` : null }));
vi.mock("./AppNav", () => ({ default: () => null }));
vi.mock("../i18n/LanguageContext", async () => {
  const { getAppStrings } = await import("../config/strings");
  return { useStrings: () => getAppStrings(mocks.language), useResolvedLanguage: () => mocks.language };
});
vi.mock("../fileLibraryCache", () => ({ loadCachedFileList: vi.fn(async () => null), loadCachedStorageItemsFromLocalStorage: vi.fn(() => []), saveCachedFileList: vi.fn() }));
vi.mock("../chatHistoryCache", () => ({ loadCachedChatListFromLocalStorage: vi.fn(() => []), saveCachedChatList: vi.fn() }));
vi.mock("../features/chats/sidebar/chatDeltaSync", () => ({ syncChatReplicaDeltas: vi.fn(async () => undefined) }));

const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function file(id: string, originalName: string, chatId: string, chatTitle: string): FamilyFile {
  return {
    id,
    familyId: "family-1",
    uploadedBy: "member-1",
    chatId,
    chatTitle,
    chatType: "group",
    originMessageId: "message-1",
    accessScope: "chat",
    storageProvider: "local",
    originalName,
    mimeType: originalName.endsWith(".jpg") ? "image/jpeg" : originalName.endsWith(".webm") ? "video/webm" : originalName.endsWith(".mp3") ? "audio/mpeg" : "text/markdown",
    sizeBytes: 1024,
    checksum: null,
    createdAt: "2026-09-08T00:00:00.000Z",
    deletedAt: null,
    isFavorite: false,
  };
}

async function renderPage(files: FamilyFile[]) {
  mocks.files = files;
  mocks.authRequest.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/family") return { name: "Stovo Demo", minimizedChatLayout: false };
    if (path === "/api/files") return mocks.files;
    if (init?.method === "DELETE") return undefined;
    return [];
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(<MemoryRouter><FilesPage /></MemoryRouter>);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
  return host;
}

beforeEach(() => {
  mocks.language = "en";
  window.localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
});

afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
  window.localStorage.clear();
});

describe("Storage file preview", () => {
  it("upscales photos to the standard frame and enlarges the content together with the dialog", async () => {
    const host = await renderPage([file("photo-1", "Small photo.jpg", "chat-family", "Family chat")]);
    await act(async () => host.querySelector<HTMLButtonElement>("[data-storage-file-id]")?.click());
    const image = host.querySelector<HTMLImageElement>(".storage-preview-media > img")!;
    Object.defineProperties(image, { naturalWidth: { value: 160 }, naturalHeight: { value: 90 } });
    await act(async () => image.dispatchEvent(new Event("load")));
    const regularWidth = parseFloat(image.style.width);
    expect(regularWidth).toBeGreaterThan(160);
    expect(host.querySelector(".storage-preview-backdrop")).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Full screen"]')?.click());
    expect(parseFloat(image.style.width)).toBeGreaterThan(regularWidth);
    expect(host.querySelector('[aria-label="Full screen"] .lucide-minimize2')).not.toBeNull();
  });
  it("places all file controls inside the preview and opens metadata in its own popup", async () => {
    const host = await renderPage([file("photo-1", "Family photo.jpg", "chat-family", "Family chat")]);
    await act(async () => host.querySelector<HTMLButtonElement>("[data-storage-file-id]")?.click());

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector(".storage-mobile-detail-header h2")?.textContent).toBe("Family photo.jpg");
    expect(dialog!.querySelector(".storage-preview-actions")?.parentElement).toBe(dialog!.querySelector(".storage-preview-media"));
    expect(Array.from(dialog!.querySelectorAll<HTMLButtonElement>(".storage-preview-actions button"))
      .map((button) => button.getAttribute("aria-label")))
      .toEqual(["Download", "Full screen", "More actions"]);

    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="More actions"]')?.click());
    const metadata = host.querySelector(".storage-metadata-menu");
    expect(metadata?.textContent).not.toContain("1024 bytes");
    expect(metadata?.querySelector('[aria-label="Metadata"] svg')).not.toBeNull();
    expect(metadata?.querySelector('[aria-label="Open in chat"]')).not.toBeNull();
    expect(metadata?.querySelector('[aria-label="Favorite"]')).not.toBeNull();
    expect(metadata?.querySelector('[aria-label="Delete"]')).not.toBeNull();
    for (const action of Array.from(metadata!.querySelectorAll<HTMLButtonElement>(".storage-metadata-action"))) {
      expect(action.querySelector("svg")).not.toBeNull();
      expect(action.textContent?.trim()).not.toBe("");
    }

    await act(async () => metadata?.querySelector<HTMLButtonElement>('[aria-label="Metadata"]')?.click());
    const information = host.querySelector('[role="dialog"][aria-label="Metadata"]');
    expect(information?.textContent).toContain("Size");
    expect(information?.textContent).toContain("1024 bytes");
    expect(information?.textContent).toContain("Saved");
    expect(information?.textContent).toContain("Source");
  });

  it("offers full-screen expansion for video, document, and audio previews", async () => {
    for (const [id, name] of [["video-1", "Recording.webm"], ["doc-1", "Notes.md"], ["audio-1", "Voice.mp3"], ["archive-1", "Export.zip"]]) {
      const host = await renderPage([file(id, name, "chat-family", "Family chat")]);
      await act(async () => host.querySelector<HTMLButtonElement>("[data-storage-file-id]")?.click());
      const fullScreen = host.querySelector<HTMLButtonElement>('[aria-label="Full screen"]');
      expect(fullScreen).not.toBeNull();
      await act(async () => fullScreen?.click());
      expect(host.querySelector(".storage-preview-dialog")?.classList.contains("is-expanded")).toBe(true);
      await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Full screen"]')?.click());
      expect(host.querySelector(".storage-preview-dialog")?.classList.contains("is-expanded")).toBe(false);
      await act(async () => roots.pop()?.unmount());
      host.remove();
    }
  });

  it("offers independent premium file and folder grouping settings beside search", async () => {
    window.localStorage.setItem("stovo_storage_group_files", "true");
    window.localStorage.setItem("stovo_storage_group_folders", "true");
    const host = await renderPage([
      file("photo-1", "Family photo.jpg", "chat-family", "Family chat"),
      file("notes-1", "Notes.md", "chat-planning", "Planning Team"),
    ]);

    const search = host.querySelector(".storage-search");
    const settings = host.querySelector<HTMLButtonElement>('[aria-label="Storage settings"]');
    expect(settings).not.toBeNull();
    expect(search?.parentElement?.contains(settings!)).toBe(true);

    await act(async () => settings?.click());
    expect(host.querySelector(".storage-settings-menu")?.textContent).toContain("File groups");
    expect(host.querySelector(".storage-settings-menu")?.textContent).toContain("Folder groups");
    expect(host.querySelectorAll(".storage-settings-menu .premium-badge")).toHaveLength(2);

    expect(host.querySelector<HTMLButtonElement>('[aria-label="File groups"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Folder groups"]')?.disabled).toBe(true);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="File groups"]')?.click());
    expect(host.querySelectorAll(".storage-group-heading")).toHaveLength(0);
    expect(host.querySelector(".storage-settings-menu [aria-label=" + JSON.stringify("Folder groups") + "]")?.getAttribute("aria-pressed")).toBe("false");
    expect(window.localStorage.getItem("stovo_storage_group_files")).toBeNull();
    expect(window.localStorage.getItem("stovo_storage_group_folders")).toBeNull();
  });

  it("keeps the source collapse control in a non-layout overlay", async () => {
    const host = await renderPage([file("photo-1", "Family photo.jpg", "chat-family", "Family chat")]);
    const collapse = host.querySelector<HTMLButtonElement>(".storage-source-collapse");
    expect(collapse).not.toBeNull();
    expect(collapse?.getAttribute("aria-label")).toBe("Collapse chat list");
    expect(collapse?.parentElement?.classList.contains("storage-source-sidebar")).toBe(true);
  });
});
