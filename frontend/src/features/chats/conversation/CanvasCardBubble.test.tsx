import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { CanvasCardBubble } from "./CanvasCardBubble";
import * as canvasApi from "../../../api/canvas";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("CanvasCardBubble", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  it("renders locked state when canvas is unavailable", async () => {
    const onOpen = vi.fn();
    await act(async () => {
      root?.render(
        <CanvasCardBubble
          canvas={{ id: "c1", title: "Secret Canvas", available: false }}
          accessToken="tok"
          onOpenCanvas={onOpen}
        />
      );
    });

    expect(container?.querySelector(".canvas-card-bubble-locked")).not.toBeNull();
    expect(container?.textContent).toContain("Canvas unavailable");
  });

  it("fetches document and renders rich preview with title and open action", async () => {
    const doc = new Y.Doc();
    const blocks = doc.getArray("blocks");
    const map = new Y.Map();
    map.set("id", "b1");
    map.set("kind", "markdown");
    map.set("content", new Y.Text("# Meeting Notes\n- Ship v2.0\n- Review PRs"));
    blocks.push([map]);

    const bytes = Y.encodeStateAsUpdate(doc);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    const update = btoa(binary);

    vi.spyOn(canvasApi, "getCanvasDocument").mockResolvedValue({
      updates: [
        {
          sequence: 1,
          update,
          createdBy: "u1",
          createdAt: "2026-09-08T00:00:00Z",
        },
      ],
    });

    const onOpen = vi.fn();

    await act(async () => {
      root?.render(
        <CanvasCardBubble
          canvas={{ id: "c1", title: "Meeting Notes", available: true }}
          accessToken="tok"
          onOpenCanvas={onOpen}
        />
      );
    });

    expect(container?.querySelector(".canvas-card-bubble-title")?.textContent).toBe(
      "Meeting Notes"
    );
    expect(container?.querySelector(".canvas-card-bubble-subtitle")?.textContent).toBe(
      "View Markdown in Canvas"
    );
    expect(container?.querySelector(".canvas-card-bubble-icon-badge")?.textContent).toBe(
      "T"
    );
    expect(container?.querySelector(".canvas-card-bubble-open-btn")).not.toBeNull();
    expect(container?.querySelector(".canvas-card-bubble-open")?.textContent).toBe(
      "Open"
    );
    expect(container?.textContent).toContain("Ship v2.0");
    expect(container?.textContent).toContain("Review PRs");

    // Click bubble opens canvas
    act(() => {
      const bubble = container?.querySelector(".canvas-card-bubble") as HTMLElement;
      bubble?.click();
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
