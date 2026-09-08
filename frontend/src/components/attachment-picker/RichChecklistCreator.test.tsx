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
  it("renders with default category pills and input fields", () => {
    const container = renderCreator();

    expect(container.textContent).toContain("Groceries");
    expect(container.textContent).toContain("Errands");
    expect(container.textContent).toContain("Task List");
    expect(container.querySelector("#checklist-title-input")).not.toBeNull();
    expect(container.querySelector(".checklist-quick-add")).not.toBeNull();
    expect(container.textContent).toContain("Create Checklist");
    expect(container.textContent).toContain("Cancel");
  });

  it("switches category and sets default title when Errands is selected", () => {
    const container = renderCreator();

    const errandBtn = Array.from(
      container.querySelectorAll(".checklist-cat-btn")
    ).find((el) => el.textContent?.includes("Errands")) as HTMLButtonElement;

    act(() => {
      errandBtn.click();
    });

    const titleInput = container.querySelector("#checklist-title-input") as HTMLInputElement;
    expect(titleInput.value).toBe("Weekend Errands");
  });

  it("adds items via quick-add input and submits checklist when clicking Create Checklist", async () => {
    const onSubmit = vi.fn();
    const container = renderCreator(onSubmit);

    const input = container.querySelector(".checklist-quick-add") as HTMLInputElement;
    const addBtn = container.querySelector(".checklist-add-btn") as HTMLButtonElement;

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;

    act(() => {
      nativeInputValueSetter?.call(input, "Apples & Bananas");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    act(() => {
      addBtn.click();
    });

    const itemInput = container.querySelector(".checklist-item-input") as HTMLInputElement;
    expect(itemInput?.value).toBe("Apples & Bananas");

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
          expect.objectContaining({ text: "Apples & Bananas" })
        ])
      })
    );
  });

  it("renders disabled voice button with PRO badge for the premium voice feature", () => {
    const container = renderCreator();
    const voiceBtn = container.querySelector(".checklist-voice-btn") as HTMLButtonElement;

    expect(voiceBtn).toBeDefined();
    expect(voiceBtn.disabled).toBe(true);
    expect(voiceBtn.textContent).toContain("Voice to List");
    expect(voiceBtn.textContent).toContain("PRO");
  });
});
