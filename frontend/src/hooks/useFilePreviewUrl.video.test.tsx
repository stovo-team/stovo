import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FamilyFile } from "../api/files";
import { downloadFileBlob } from "../api/files";
import { peekCachedObjectUrl } from "../mediaBlobCache";
import { shouldAutoDownloadMedia } from "../mediaDownloadPolicy";
import useFilePreviewUrl from "./useFilePreviewUrl";

vi.mock("../api/files", () => ({ downloadFileBlob: vi.fn() }));
vi.mock("../mediaBlobCache", () => ({ peekCachedObjectUrl: vi.fn() }));
vi.mock("../mediaDownloadPolicy", () => ({ shouldAutoDownloadMedia: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let cacheUrl: string | null;
const roots: Root[] = [];

function PreviewProbe({ file, enabled, allowVideoPreview }: { file: FamilyFile; enabled?: boolean; allowVideoPreview?: boolean }) {
  const previewUrl = useFilePreviewUrl("test-token", file, enabled, allowVideoPreview);
  return <output>{previewUrl ?? "no-preview"}</output>;
}

function mount(file: FamilyFile, enabled?: boolean, allowVideoPreview?: boolean) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<PreviewProbe file={file} enabled={enabled} allowVideoPreview={allowVideoPreview} />));
  return container;
}

const videoFile: FamilyFile = {
  id: "video-1",
  familyId: "family-1",
  uploadedBy: "user-1",
  chatId: "chat-1",
  chatTitle: "Chat",
  chatType: "group",
  originMessageId: "message-1",
  accessScope: "chat",
  storageProvider: "local",
  originalName: "clip.mp4",
  mimeType: "video/mp4",
  sizeBytes: 100,
  checksum: null,
  createdAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
  isFavorite: false
};

describe("useFilePreviewUrl video opt-in", () => {
  beforeEach(() => {
    cacheUrl = null;
    vi.mocked(peekCachedObjectUrl).mockImplementation(() => cacheUrl);
    vi.mocked(shouldAutoDownloadMedia).mockReturnValue(true);
    vi.mocked(downloadFileBlob).mockImplementation(async () => {
      cacheUrl = "blob:video-preview";
    });
  });

  afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it("does not preview videos by default for existing enabled callers", async () => {
    let container!: HTMLDivElement;
    await act(async () => {
      container = mount(videoFile, true);
    });

    expect(container.textContent).toBe("no-preview");
    expect(downloadFileBlob).not.toHaveBeenCalled();
    expect(shouldAutoDownloadMedia).not.toHaveBeenCalled();
  });

  it("loads a video preview when the caller explicitly opts in", async () => {
    let container!: HTMLDivElement;
    await act(async () => {
      container = mount(videoFile, true, true);
    });

    expect(downloadFileBlob).toHaveBeenCalledWith("test-token", "video-1");
    expect(container.textContent).toBe("blob:video-preview");
  });

  it("leaves a video without a preview when automatic download policy rejects its size", async () => {
    const oversizedVideo = { ...videoFile, sizeBytes: 11 * 1024 * 1024 };
    vi.mocked(shouldAutoDownloadMedia).mockReturnValue(false);
    let container!: HTMLDivElement;
    await act(async () => {
      container = mount(oversizedVideo, true, true);
    });

    expect(container.textContent).toBe("no-preview");
    expect(shouldAutoDownloadMedia).toHaveBeenCalledWith(oversizedVideo);
    expect(downloadFileBlob).not.toHaveBeenCalled();
  });

  it("does not download a video when the caller disables previews", async () => {
    let container!: HTMLDivElement;
    await act(async () => {
      container = mount(videoFile, false, true);
    });

    expect(container.textContent).toBe("no-preview");
    expect(shouldAutoDownloadMedia).not.toHaveBeenCalled();
    expect(downloadFileBlob).not.toHaveBeenCalled();
  });
});
