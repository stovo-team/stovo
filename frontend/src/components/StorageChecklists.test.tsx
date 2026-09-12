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

  it("renders checklists with concise metadata", async () => {
    await act(async () => {
      root?.render(<StorageChecklists accessToken="token" filter="all" search="" />);
    });

    expect(container?.textContent).toContain("Grocery Shopping");
    expect(container?.textContent).toContain("Weekend Errands");
    expect(container?.textContent).toContain("Groceries • 1/3 done");
    expect(container?.textContent).not.toContain(".checklist");
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

  it("renders checklist preview with items, checkboxes, and progress bar", async () => {
    const detailedChecklists: checklistApi.Checklist[] = [
      {
        id: "cl-preview-1",
        familyId: "fam-1",
        originChatId: "chat-1",
        createdBy: "user-1",
        title: "Home Renovation",
        category: "general",
        linkedChatIds: [],
        canManage: true,
        items: [
          {
            id: "item-1",
            checklistId: "cl-preview-1",
            text: "Paint living room",
            completed: true,
            position: 0,
            createdBy: "user-1",
            createdAt: "2026-09-08T00:00:00Z",
            updatedAt: "2026-09-08T00:00:00Z"
          },
          {
            id: "item-2",
            checklistId: "cl-preview-1",
            text: "Install kitchen cabinets",
            completed: false,
            position: 1,
            createdBy: "user-1",
            createdAt: "2026-09-08T00:00:00Z",
            updatedAt: "2026-09-08T00:00:00Z"
          },
          {
            id: "item-3",
            checklistId: "cl-preview-1",
            text: "Replace bathroom tiles",
            completed: false,
            position: 2,
            createdBy: "user-1",
            createdAt: "2026-09-08T00:00:00Z",
            updatedAt: "2026-09-08T00:00:00Z"
          },
          {
            id: "item-4",
            checklistId: "cl-preview-1",
            text: "Order new curtains",
            completed: false,
            position: 3,
            createdBy: "user-1",
            createdAt: "2026-09-08T00:00:00Z",
            updatedAt: "2026-09-08T00:00:00Z"
          }
        ],
        totalItems: 4,
        completedItems: 1,
        createdAt: "2026-09-08T00:00:00Z",
        updatedAt: "2026-09-08T00:00:00Z"
      }
    ];

    vi.spyOn(checklistApi, "getStorageChecklists").mockResolvedValue(detailedChecklists);

    await act(async () => {
      root?.render(<StorageChecklists accessToken="token" filter="all" search="" />);
    });

    // Check preview items are rendered
    expect(container?.textContent).toContain("Paint living room");
    expect(container?.textContent).toContain("Install kitchen cabinets");
    expect(container?.textContent).toContain("Replace bathroom tiles");
    expect(container?.textContent).toContain("+1 more");

    // Check completion progress is visible
    expect(container?.textContent).toContain("1/4");

    // Check progress bar exists
    const progressBar = container?.querySelector(".checklist-preview-progress");
    expect(progressBar).not.toBeNull();

    // Check checkmark exists for completed item
    const checkedBoxes = container?.querySelectorAll(".checklist-preview-checkbox.is-checked");
    expect(checkedBoxes?.length).toBe(1);
  });

  it("renders empty preview state when checklist has no items", async () => {
    const emptyChecklists: checklistApi.Checklist[] = [
      {
        id: "cl-empty",
        familyId: "fam-1",
        originChatId: "chat-1",
        createdBy: "user-1",
        title: "Empty List",
        category: "grocery",
        linkedChatIds: [],
        canManage: true,
        items: [],
        totalItems: 0,
        completedItems: 0,
        createdAt: "2026-09-08T00:00:00Z",
        updatedAt: "2026-09-08T00:00:00Z"
      }
    ];

    vi.spyOn(checklistApi, "getStorageChecklists").mockResolvedValue(emptyChecklists);

    await act(async () => {
      root?.render(<StorageChecklists accessToken="token" filter="all" search="" />);
    });

    expect(container?.textContent).toContain("Empty checklist");
  });
});
