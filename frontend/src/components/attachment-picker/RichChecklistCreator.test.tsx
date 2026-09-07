import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichChecklistCreator } from "./RichChecklistCreator";

const mountedRoots: Root[] = [];

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => {
      root?.unmount();
    });
  }
  document.body.innerHTML = "";
});

function renderCreator(onSubmit = vi.fn(), onCancel = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  act(() => {
    root.render(<RichChecklistCreator onSubmit={onSubmit} onCancel={onCancel} />);
  });

  return container;
}

describe("RichChecklistCreator", () => {
  it("renders with default category pills, quick packs, and input fields", () => {
    const container = renderCreator();

    expect(container.textContent).toContain("Groceries");
    expect(container.textContent).toContain("Errands");
    expect(container.textContent).toContain("Task List");
    expect(container.textContent).toContain("Load Grocery Pack");
    expect(container.querySelector("#checklist-title-input")).not.toBeNull();
    expect(container.querySelector(".checklist-quick-add")).not.toBeNull();
  });

  it("switches category and displays errand template pack when Errands is selected", () => {
    const container = renderCreator();

    const errandBtn = Array.from(
      container.querySelectorAll(".checklist-cat-btn")
    ).find((el) => el.textContent?.includes("Errands")) as HTMLButtonElement;

    act(() => {
      errandBtn.click();
    });

    const titleInput = container.querySelector("#checklist-title-input") as HTMLInputElement;
    expect(container.textContent).toContain("Load Errand Pack");
    expect(titleInput.value).toBe("Weekend Errands");
  });

  it("inserts template pack items when clicking template button", () => {
    const container = renderCreator();

    const groceryPackBtn = container.querySelector(".checklist-template-btn") as HTMLButtonElement;

    act(() => {
      groceryPackBtn.click();
    });

    const itemInputs = Array.from(
      container.querySelectorAll(".checklist-item-input")
    ) as HTMLInputElement[];
    const itemValues = itemInputs.map((i) => i.value);

    expect(itemValues).toContain("Apples & Bananas");
    expect(itemValues).toContain("Spinach & Avocados");
    expect(container.textContent).toContain("Produce");
  });

  it("submits the checklist with items when clicking Share button", async () => {
    const onSubmit = vi.fn();
    const container = renderCreator(onSubmit);

    const groceryPackBtn = container.querySelector(".checklist-template-btn") as HTMLButtonElement;

    act(() => {
      groceryPackBtn.click();
    });

    const submitBtn = container.querySelector(".checklist-action-btn.primary") as HTMLButtonElement;

    await act(async () => {
      submitBtn.click();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Grocery list",
        category: "grocery",
        items: expect.arrayContaining([
          expect.objectContaining({ text: "Apples & Bananas", section: "Produce" }),
          expect.objectContaining({ text: "Spinach & Avocados", section: "Produce" })
        ])
      })
    );
  });
});
