import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CallUiPreview } from "./call-ui-preview";

const roots: Root[] = [];

afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
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
  const button = container.querySelector<HTMLElement>(`[aria-label="${name}"]`);
  if (!button) throw new Error(`Expected button ${name}`);
  act(() => button.click());
  return button;
}

describe("call UI preview", () => {
  it("places mic, speaker and camera on the first mobile row and the other three actions on the second", () => {
    const container = mountPreview();
    click(container, "Mobile");
    const rows = container.querySelectorAll("[data-preview-control-row]");
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelectorAll("button")).toHaveLength(3);
    expect(rows[0].querySelector('[aria-label="Mute"]')).not.toBeNull();
    expect(rows[0].querySelector('[aria-label="Audio output"]')).not.toBeNull();
    expect(rows[0].querySelector('[aria-label="Turn on camera"]')).not.toBeNull();
    expect(rows[1].querySelectorAll("button")).toHaveLength(3);
    expect(rows[1].querySelector('[aria-label="Audio settings"]')).not.toBeNull();
    expect(rows[1].querySelector('[aria-label="Share screen"]')).not.toBeNull();
    expect(rows[1].querySelector('[aria-label="End call"]')).not.toBeNull();
    const settings = container.querySelector<HTMLButtonElement>('[aria-label="Audio settings"]');
    expect(settings?.textContent?.trim()).toBe("");
  });

  it("shows remote video full-screen and places the enabled local camera in a bottom-right PiP that can swap", () => {
    const container = mountPreview();
    expect(container.querySelector('[data-stage-role="remote-primary"]')).not.toBeNull();
    expect(container.querySelector('[data-stage-role="local-pip"]')).toBeNull();
    expect(container.querySelector('[aria-label="Flip camera"]')).toBeNull();
    click(container, "Turn on camera");
    const pip = container.querySelector('[data-stage-role="local-pip"]');
    expect(pip?.classList.contains("bottom-right")).toBe(true);
    const flip = pip?.querySelector<HTMLButtonElement>('[aria-label="Flip camera"]');
    expect(flip).not.toBeNull();
    act(() => flip?.click());
    expect(flip?.getAttribute("aria-pressed")).toBe("true");
    click(container, "Focus your video");
    expect(container.querySelector('[data-stage-role="local-primary"]')).not.toBeNull();
    expect(container.querySelector('[data-stage-role="remote-pip"]')).not.toBeNull();
  });

  it.each(["Enter", " "])("does not swap preview participant roles when %s activates Flip in the local PiP", (key) => {
    const container = mountPreview();
    click(container, "Mobile");
    click(container, "Turn on camera");
    const flip = container.querySelector('[data-stage-role="local-pip"] [aria-label="Flip camera"]') as HTMLButtonElement;
    expect(flip).not.toBeNull();
    expect(container.querySelector('[data-stage-role="remote-primary"]')).not.toBeNull();

    act(() => flip.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    expect(container.querySelector('[data-stage-role="remote-primary"]')).not.toBeNull();
    expect(container.querySelector('[data-stage-role="local-pip"]')).not.toBeNull();
    if (key === " ") {
      act(() => flip.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true })));
      expect(container.querySelector('[data-stage-role="remote-primary"]')).not.toBeNull();
      expect(container.querySelector('[data-stage-role="local-pip"]')).not.toBeNull();
    }

    act(() => flip.click());
    expect(flip.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-stage-role="remote-primary"]')).not.toBeNull();
    expect(container.querySelector('[data-stage-role="local-pip"]')).not.toBeNull();
  });

  it("auto-hides controls after 15 seconds and lets a stage tap reveal them", () => {
    vi.useFakeTimers();
    const container = mountPreview();
    act(() => vi.advanceTimersByTime(15_000));
    expect(container.querySelector(".call-preview-controls")?.classList.contains("is-hidden")).toBe(true);
    click(container, "Toggle call controls");
    expect(container.querySelector(".call-preview-controls")?.classList.contains("is-hidden")).toBe(false);
  });

  it("minimizes through a standalone icon button without opening a menu", () => {
    const container = mountPreview();
    const minimize = click(container, "Minimize call");
    expect(minimize.querySelector("svg")).not.toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[aria-label="Restore call"]')).not.toBeNull();
  });

  it.each(["Desktop", "Mobile"]) ("uses square avatar/video participant cards while sharing on %s", (viewport) => {
    const container = mountPreview();
    click(container, viewport);
    click(container, "Turn on camera");
    click(container, "Share screen");
    const tiles = Array.from(container.querySelectorAll<HTMLElement>(".call-preview-share-participant"));
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles.every((tile) => tile.style.aspectRatio === "1 / 1")).toBe(true);
    expect(container.querySelector(".call-preview-share-participant .call-preview-avatar")).not.toBeNull();
    expect(container.querySelector(".call-preview-share-participant .video-placeholder")).not.toBeNull();
  });
});
