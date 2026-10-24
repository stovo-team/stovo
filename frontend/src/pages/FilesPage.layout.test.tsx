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
  async function renderFilesPage() {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(<MemoryRouter><FilesPage /></MemoryRouter>);
      await Promise.resolve();
    });
    return host;
  }

  it("keeps the close button hidden initially and resizes the source list by dragging its divider", async () => {
    const host = await renderFilesPage();
    const layout = host.querySelector<HTMLElement>(".storage-layout");
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Collapse chat list"]');
    const divider = host.querySelector<HTMLElement>('[role="separator"][aria-label="Resize chat list"]');

    expect(toggle?.hidden).toBe(true);
    expect(divider?.getAttribute("aria-valuenow")).toBe("300");

    await act(async () => {
      divider?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 300 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 420 }));
    });

    expect(layout?.style.getPropertyValue("--storage-source-width")).toBe("420px");
    expect(layout?.classList.contains("storage-layout--source-collapsed")).toBe(false);
  });

  it("supports keyboard resizing through the divider", async () => {
    const host = await renderFilesPage();
    const layout = host.querySelector<HTMLElement>(".storage-layout");
    const divider = host.querySelector<HTMLElement>('[role="separator"][aria-label="Resize chat list"]');

    await act(async () => {
      divider?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    });

    expect(layout?.style.getPropertyValue("--storage-source-width")).toBe("324px");
    expect(divider?.getAttribute("aria-valuenow")).toBe("324");
  });

  it("auto-collapses when the source list is dragged below its minimum width", async () => {
    const host = await renderFilesPage();
    const layout = host.querySelector<HTMLElement>(".storage-layout");
    const divider = host.querySelector<HTMLElement>('[role="separator"][aria-label="Resize chat list"]');

    await act(async () => {
      divider?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 300 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 160 }));
    });

    expect(layout?.classList.contains("storage-layout--source-collapsed")).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Expand chat list"]')?.hidden).toBe(false);
  });

  it("collapses and restores the source picker without changing the selected chat", async () => {
    const host = await renderFilesPage();
    const layout = host.querySelector(".storage-layout");
    const divider = host.querySelector('[role="separator"][aria-label="Resize chat list"]');
    await act(async () => {
      divider?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 300 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 420 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    });
    await act(async () => {
      divider?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 420 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 160 }));
    });

    expect(layout?.classList.contains("storage-layout--source-collapsed")).toBe(true);
    const expandButton = host.querySelector<HTMLButtonElement>('[aria-label="Expand chat list"]');
    expect(expandButton?.hidden).toBe(false);
    expect(expandButton?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => expandButton?.click());
    expect(layout?.classList.contains("storage-layout--source-collapsed")).toBe(false);
    const collapseButton = host.querySelector<HTMLButtonElement>('[aria-label="Collapse chat list"]');
    expect(collapseButton?.hidden).toBe(true);
    expect(collapseButton?.getAttribute("aria-expanded")).toBe("true");
    expect(layout?.getAttribute("style")).toContain("--storage-source-width: 300px");
    expect(host.querySelector(".storage-source.active")?.textContent).toContain("All chats");
  });
});
