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

  it("renders blank canvas preview when document has no blocks", async () => {
    vi.spyOn(canvasApi, "getCanvasDocument").mockResolvedValue({ updates: [] });

    await act(async () => {
      root?.render(<StorageCanvases accessToken="token" filter="all" search="" />);
    });

    const blankPreview = container?.querySelector(".canvas-preview-blank");
    expect(blankPreview).not.toBeNull();
  });

  it("renders markdown notes preview when canvas document contains text blocks", async () => {
    const doc = new (await import("yjs")).Doc();
    const blocks = doc.getArray("blocks");
    const map = new (await import("yjs")).Map();
    map.set("id", "b1");
    map.set("kind", "markdown");
    map.set("content", new (await import("yjs")).Text("# Sprint Planning\n- Ship search feature\n- Fix audio waveforms"));
    blocks.push([map]);

    const bytes = (await import("yjs")).encodeStateAsUpdate(doc);
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    const update = btoa(binary);

    vi.spyOn(canvasApi, "getCanvasDocument").mockResolvedValue({
      updates: [{ sequence: 1, update, createdBy: "user-1", createdAt: "2026-09-08T00:00:00Z" }]
    });

    await act(async () => {
      root?.render(<StorageCanvases accessToken="token" filter="all" search="" />);
    });

    expect(container?.textContent).toContain("Ship search feature");
    expect(container?.textContent).toContain("Fix audio waveforms");
    expect(container?.querySelector(".canvas-preview-notes")).not.toBeNull();
  });

  it("renders whiteboard vector SVG preview when canvas document contains scene elements", async () => {
    const doc = new (await import("yjs")).Doc();
    const blocks = doc.getArray("blocks");
    const map = new (await import("yjs")).Map();
    map.set("id", "b2");
    map.set("kind", "whiteboard");
    map.set("scene", new (await import("yjs")).Text(JSON.stringify([
      { type: "rectangle", x: 10, y: 10, width: 80, height: 50, strokeColor: "#818cf8" }
    ])));
    blocks.push([map]);

    const bytes = (await import("yjs")).encodeStateAsUpdate(doc);
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    const update = btoa(binary);

    vi.spyOn(canvasApi, "getCanvasDocument").mockResolvedValue({
      updates: [{ sequence: 1, update, createdBy: "user-1", createdAt: "2026-09-08T00:00:00Z" }]
    });

    await act(async () => {
      root?.render(<StorageCanvases accessToken="token" filter="all" search="" />);
    });

    const svg = container?.querySelector(".canvas-preview-svg");
    expect(svg).not.toBeNull();
    const rect = svg?.querySelector("rect");
    expect(rect).not.toBeNull();
  });

  it("adapts dark stroke colors like #1e1e1e to high contrast off-white for dark tiles", async () => {
    const doc = new (await import("yjs")).Doc();
    const blocks = doc.getArray("blocks");
    const map = new (await import("yjs")).Map();
    map.set("id", "b3");
    map.set("kind", "whiteboard");
    map.set("scene", new (await import("yjs")).Text(JSON.stringify([
      { type: "freedraw", x: 20, y: 30, strokeColor: "#1e1e1e", points: [[0, 0], [10, 15], [20, 5]] }
    ])));
    blocks.push([map]);

    const bytes = (await import("yjs")).encodeStateAsUpdate(doc);
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    const update = btoa(binary);

    vi.spyOn(canvasApi, "getCanvasDocument").mockResolvedValue({
      updates: [{ sequence: 1, update, createdBy: "user-1", createdAt: "2026-09-08T00:00:00Z" }]
    });

    await act(async () => {
      root?.render(<StorageCanvases accessToken="token" filter="all" search="" />);
    });

    const path = container?.querySelector(".canvas-preview-svg path");
    expect(path).not.toBeNull();
    expect(path?.getAttribute("stroke")).toBe("#f1f5f9");
    expect(path?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
  });

  it("renders clean Empty canvas placeholder without toy mockup notes", async () => {
    vi.spyOn(canvasApi, "getCanvasDocument").mockResolvedValue({ updates: [] });

    await act(async () => {
      root?.render(<StorageCanvases accessToken="token" filter="all" search="" />);
    });

    expect(container?.textContent).toContain("Empty canvas");
    expect(container?.querySelector(".canvas-mock-sticky")).toBeNull();
    expect(container?.querySelector(".canvas-mock-shape")).toBeNull();
  });
});
