import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChecklistCardBubble } from "./ChecklistCardBubble";
import type { ChecklistCard } from "../../../api/checklist";
import * as checklistApi from "../../../api/checklist";

const mountedRoots: Root[] = [];

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => {
      root?.unmount();
    });
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function renderCard(checklist: ChecklistCard, onOpen = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  act(() => {
    root.render(
      <ChecklistCardBubble
        checklist={checklist}
        accessToken="test-token"
        currentUserId="user-1"
        onOpenChecklist={onOpen}
      />
    );
  });

  return container;
}

describe("ChecklistCardBubble", () => {
  const mockChecklist: ChecklistCard = {
    id: "cl-123",
    title: "Weekly Grocery Run",
    category: "groceries",
    available: true,
    totalItems: 3,
    completedItems: 1,
    canManage: true,
    items: [
      {
        id: "item-1",
        checklistId: "cl-123",
        text: "Apples",
        completed: true,
        position: 1,
        section: "Produce",
        createdBy: "user-1",
        createdAt: "2026-09-07T12:00:00Z",
        updatedAt: "2026-09-07T12:00:00Z"
      },
      {
        id: "item-2",
        checklistId: "cl-123",
        text: "Whole Milk",
        completed: false,
        position: 2,
        section: "Dairy",
        createdBy: "user-1",
        createdAt: "2026-09-07T12:00:00Z",
        updatedAt: "2026-09-07T12:00:00Z"
      },
      {
        id: "item-3",
        checklistId: "cl-123",
        text: "Sourdough Bread",
        completed: false,
        position: 3,
        section: "Bakery",
        createdBy: "user-1",
        createdAt: "2026-09-07T12:00:00Z",
        updatedAt: "2026-09-07T12:00:00Z"
      }
    ]
  };

  it("renders checklist card with title, category badge, and completion stats", () => {
    const container = renderCard(mockChecklist);

    expect(container.textContent).toContain("Weekly Grocery Run");
    expect(container.textContent).toContain("Groceries");
    expect(container.textContent).toContain("1 of 3 completed");
    expect(container.textContent).toContain("33%");
    expect(container.querySelector(".checklist-card-open-btn")).not.toBeNull();
  });

  it("renders section headers and task items", () => {
    const container = renderCard(mockChecklist);

    expect(container.textContent).toContain("Produce");
    expect(container.textContent).toContain("Apples");
    expect(container.textContent).toContain("Dairy");
    expect(container.textContent).toContain("Whole Milk");
    expect(container.textContent).toContain("Bakery");
    expect(container.textContent).toContain("Sourdough Bread");
  });

  it("calls onOpenChecklist when clicking open button", () => {
    const onOpen = vi.fn();
    const container = renderCard(mockChecklist, onOpen);

    const openBtn = container.querySelector(".checklist-card-open-btn") as HTMLButtonElement;
    act(() => {
      openBtn.click();
    });

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("toggles item completion optimistically and calls toggleChecklistItem API", async () => {
    const toggleSpy = vi.spyOn(checklistApi, "toggleChecklistItem").mockResolvedValue({
      ...mockChecklist,
      completedItems: 2,
      items: mockChecklist.items.map((it) => (it.id === "item-2" ? { ...it, completed: true } : it))
    } as any);

    const container = renderCard(mockChecklist);

    const itemButtons = container.querySelectorAll(".checklist-card-checkbox");
    expect(itemButtons.length).toBe(3);

    await act(async () => {
      (itemButtons[1] as HTMLButtonElement).click();
    });

    expect(toggleSpy).toHaveBeenCalledWith("test-token", "cl-123", "item-2");
  });

  it("submits new items via the quick-add form", async () => {
    const addSpy = vi.spyOn(checklistApi, "addChecklistItem").mockResolvedValue({
      ...mockChecklist,
      totalItems: 4,
      items: [
        ...mockChecklist.items,
        {
          id: "item-4",
          checklistId: "cl-123",
          text: "Eggs",
          completed: false,
          position: 4,
          createdBy: "user-1",
          createdAt: "2026-09-07T12:00:00Z",
          updatedAt: "2026-09-07T12:00:00Z"
        }
      ]
    } as any);

    const container = renderCard(mockChecklist);

    const form = container.querySelector(".checklist-card-quick-add") as HTMLFormElement;
    const input = container.querySelector(".checklist-card-add-input") as HTMLInputElement;

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      nativeInputValueSetter?.call(input, "Eggs");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(addSpy).toHaveBeenCalledWith("test-token", "cl-123", { text: "Eggs" });
  });
});
