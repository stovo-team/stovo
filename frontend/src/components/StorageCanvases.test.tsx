import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StorageCanvases } from "./StorageCanvases";
import * as canvasApi from "../api/canvas";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn()
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("StorageCanvases", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  const mockCanvases: canvasApi.Canvas[] = [
    {
      id: "canvas-1",
      familyId: "fam-1",
      originChatId: "archive-chat-1",
      createdBy: "user-1",
      title: "Sprint Planning",
      linkedChatIds: ["archive-chat-1"],
      canManage: true,
      createdAt: "2026-09-08T00:00:00Z",
      updatedAt: "2026-09-08T00:00:00Z"
    },
    {
      id: "canvas-2",
      familyId: "fam-1",
      originChatId: "family-chat-2",
      createdBy: "user-1",
      title: "Vacation Brainstorm",
      linkedChatIds: [],
      canManage: true,
      createdAt: "2026-09-08T00:00:00Z",
      updatedAt: "2026-09-08T00:00:00Z"
    }
  ];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(canvasApi, "getStorageCanvases").mockResolvedValue(mockCanvases);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  it("renders canvases and displays the .canvas extension in all or canvases filter", async () => {
    await act(async () => {
      root?.render(<StorageCanvases accessToken="token" filter="all" search="" />);
    });

    expect(container?.textContent).toContain("Sprint Planning");
    expect(container?.textContent).toContain("Vacation Brainstorm");
    expect(container?.textContent).toContain("Canvas • .canvas");
  });

  it("renders nothing when filter is not all and not canvases", async () => {
    await act(async () => {
      root?.render(<StorageCanvases accessToken="token" filter="photos" search="" />);
    });

    expect(container?.childElementCount).toBe(0);
  });

  it("finds all canvases when searching by special extension .canvas or *.canvas or canvas", async () => {
    await act(async () => {
      root?.render(<StorageCanvases accessToken="token" filter="all" search=".canvas" />);
    });
    expect(container?.textContent).toContain("Sprint Planning");
    expect(container?.textContent).toContain("Vacation Brainstorm");

    await act(async () => {
      root?.render(<StorageCanvases accessToken="token" filter="all" search="*.canvas" />);
    });
    expect(container?.textContent).toContain("Sprint Planning");
    expect(container?.textContent).toContain("Vacation Brainstorm");
  });

  it("finds specific canvas when searching with extension prefix like sprint.canvas", async () => {
    await act(async () => {
      root?.render(<StorageCanvases accessToken="token" filter="all" search="sprint.canvas" />);
    });

    expect(container?.textContent).toContain("Sprint Planning");
    expect(container?.textContent).not.toContain("Vacation Brainstorm");
  });

  it("filters canvases by sourceChatId matching originChatId or linkedChatIds", async () => {
    await act(async () => {
      root?.render(
        <StorageCanvases
          accessToken="token"
          filter="all"
          search=""
          sourceChatId="archive-chat-1"
        />
      );
    });

    expect(container?.textContent).toContain("Sprint Planning");
    expect(container?.textContent).not.toContain("Vacation Brainstorm");
  });
});
