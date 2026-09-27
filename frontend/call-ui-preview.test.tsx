import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CallUiPreview } from "./call-ui-preview";

const roots: Root[] = [];

afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
});

function mountPreview() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<CallUiPreview />));
  return container;
}

function click(container: ParentNode, name: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (!button) throw new Error(`Expected button ${name}`);
  act(() => button.click());
  return button;
}

describe("call UI preview interactions", () => {
  it("shows camera flip only while camera is enabled and flips its facing mode", () => {
    const container = mountPreview();
    click(container, "Mobile");
    expect(container.querySelector('[aria-label="Flip camera"]')).toBeNull();

    click(container, "Toggle Camera");
    const flip = click(container, "Flip camera");
    expect(flip.getAttribute("aria-pressed")).toBe("true");
  });

  it("organizes mobile controls into two rows while desktop controls remain in one row", () => {
    const container = mountPreview();
    click(container, "Mobile");
    expect(container.querySelectorAll(".call-preview-control-row")).toHaveLength(2);
    expect(container.querySelector(".call-preview-control-rows")?.getAttribute("data-layout")).toBe("mobile-two-row");

    click(container, "Desktop");
    expect(container.querySelectorAll(".call-preview-control-row")).toHaveLength(1);
  });

  it("opens the vertical more menu and minimizes the call from it", () => {
    const container = mountPreview();
    click(container, "More options");
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    click(container, "Minimize call");
    expect(container.querySelector(".call-preview-restore")).not.toBeNull();
  });

  it("changes the participant fixture count and rendered tiles", () => {
    const container = mountPreview();
    const count = container.querySelector<HTMLSelectElement>('[aria-label="Number of participants"]');
    expect(count).not.toBeNull();
    expect(container.querySelectorAll(".call-grid__tile")).toHaveLength(3);
    act(() => {
      count!.value = "6";
      count!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelectorAll(".call-grid__tile")).toHaveLength(6);
  });

  it("opens any participant tile in full view and closes it with Escape", () => {
    const container = mountPreview();
    const participant = container.querySelector<HTMLElement>(".call-grid__tile--remote");
    expect(participant).not.toBeNull();
    act(() => participant!.click());
    expect(container.querySelector('[role="dialog"][aria-label="Fullscreen: Alex Morgan"]')).not.toBeNull();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="dialog"][aria-label^="Fullscreen:"]')).toBeNull();
  });

  it("shows a share scene on desktop and mobile and opens the shared content in full view", () => {
    const container = mountPreview();
    click(container, "Share screen");
    expect(container.querySelector('[data-preview-screen-share="true"]')).not.toBeNull();
    click(container, "Focus shared screen");
    expect(container.querySelector('[role="dialog"][aria-label="Fullscreen: Shared screen"]')).not.toBeNull();

    click(container, "Close fullscreen");
    click(container, "Stop sharing");
    click(container, "Mobile");
    click(container, "Share screen");
    expect(container.querySelector('[data-preview-screen-share="true"]')).not.toBeNull();
  });

  it("updates the selected device from the settings panel", () => {
    const container = mountPreview();
    click(container, "Audio settings");
    const input = container.querySelector<HTMLButtonElement>('.call-audio-popup [aria-label="Select Microphone"]');
    expect(input).not.toBeNull();
    act(() => input?.click());
    const option = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((candidate) => candidate.textContent?.includes("USB Microphone"));
    expect(option).toBeDefined();
    act(() => option?.click());
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(input?.title).toContain("USB Microphone");
  });
});
