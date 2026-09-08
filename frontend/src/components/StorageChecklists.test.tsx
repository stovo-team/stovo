import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StorageChecklists } from "./StorageChecklists";
import * as checklistApi from "../api/checklist";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn()
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("StorageChecklists", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  const mockChecklists: checklistApi.Checklist[] = [
    {
      id: "cl-1",
      familyId: "fam-1",
      originChatId: "archive-chat-1",
      createdBy: "user-1",
      title: "Grocery Shopping",
      category: "grocery",
      linkedChatIds: ["archive-chat-1"],
      canManage: true,
      items: [],
      totalItems: 3,
      completedItems: 1,
      createdAt: "2026-09-08T00:00:00Z",
      updatedAt: "2026-09-08T00:00:00Z"
    },
    {
      id: "cl-2",
      familyId: "fam-1",
      originChatId: "family-chat-2",
      createdBy: "user-1",
      title: "Weekend Errands",
      category: "errand",
      linkedChatIds: [],
      canManage: true,
      items: [],
      totalItems: 5,
      completedItems: 5,
      createdAt: "2026-09-08T00:00:00Z",
      updatedAt: "2026-09-08T00:00:00Z"
    }
  ];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(checklistApi, "getStorageChecklists").mockResolvedValue(mockChecklists);
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

  it("renders checklists and displays the .checklist extension in all or checklists filter", async () => {
    await act(async () => {
      root?.render(<StorageChecklists accessToken="token" filter="all" search="" />);
    });

    expect(container?.textContent).toContain("Grocery Shopping");
    expect(container?.textContent).toContain("Weekend Errands");
    expect(container?.textContent).toContain(".checklist");
  });

  it("renders nothing when filter is not all and not checklists", async () => {
    await act(async () => {
      root?.render(<StorageChecklists accessToken="token" filter="photos" search="" />);
    });

    expect(container?.childElementCount).toBe(0);
  });

  it("finds all checklists when searching by special extension .checklist or *.checklist or checklist", async () => {
    await act(async () => {
      root?.render(<StorageChecklists accessToken="token" filter="all" search=".checklist" />);
    });
    expect(container?.textContent).toContain("Grocery Shopping");
    expect(container?.textContent).toContain("Weekend Errands");

    await act(async () => {
      root?.render(<StorageChecklists accessToken="token" filter="all" search="*.checklist" />);
    });
    expect(container?.textContent).toContain("Grocery Shopping");
    expect(container?.textContent).toContain("Weekend Errands");
  });

  it("finds specific checklist when searching with extension prefix like grocery.checklist", async () => {
    await act(async () => {
      root?.render(<StorageChecklists accessToken="token" filter="all" search="grocery.checklist" />);
    });

    expect(container?.textContent).toContain("Grocery Shopping");
    expect(container?.textContent).not.toContain("Weekend Errands");
  });

  it("filters checklists by sourceChatId matching originChatId or linkedChatIds", async () => {
    await act(async () => {
      root?.render(
        <StorageChecklists
          accessToken="token"
          filter="all"
          search=""
          sourceChatId="archive-chat-1"
        />
      );
    });

    expect(container?.textContent).toContain("Grocery Shopping");
    expect(container?.textContent).not.toContain("Weekend Errands");
  });
});
