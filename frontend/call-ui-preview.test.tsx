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
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (!button) throw new Error(`Expected button ${name}`);
  act(() => button.click());
  return button;
}

function clickMenuItem(container: ParentNode, label: string) {
  const menu = container.querySelector('[role="group"][aria-label="More call options"]');
  const item = Array.from(menu?.querySelectorAll<HTMLButtonElement>("button") ?? [])
    .find((candidate) => candidate.textContent?.trim().includes(label));
  if (!item) throw new Error(`Expected menu item ${label}`);
  act(() => item.click());
  return item;
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

  it("keeps all mobile controls in one narrow row ordered Mic, Speaker, Camera, More, End", () => {
    const container = mountPreview();
    click(container, "Mobile");
    const panel = container.querySelector<HTMLElement>(".call-preview-panel");
    panel!.style.width = "320px";
    expect(container.querySelectorAll(".call-preview-control-row")).toHaveLength(1);
    expect(container.querySelector(".call-preview-control-rows")?.getAttribute("data-layout")).toBe("mobile-one-row");
    const row = container.querySelector(".call-preview-control-row");
    const expectedControls = ["Toggle Microphone", "Toggle Speaker", "Toggle Camera", "More options", "End call"];
    const actualControls = Array.from(row?.querySelectorAll<HTMLButtonElement>("button[aria-label]") ?? [])
      .map((button) => button.getAttribute("aria-label"));
    expect(actualControls).toEqual(expectedControls);
    expect(row?.getAttribute("data-no-wrap")).toBe("true");

    click(container, "Desktop");
    expect(container.querySelectorAll(".call-preview-control-row")).toHaveLength(1);
    expect(container.querySelector(".call-preview-control-rows")?.getAttribute("data-layout")).toBe("desktop-one-row");
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

  it.each(["Mobile", "Desktop"])("opens an inline participant focus stage on %s without a modal", (viewport) => {
    const container = mountPreview();
    click(container, viewport);
    const participant = viewport === "Mobile"
      ? container.querySelector<HTMLElement>('[data-stage-role="remote-primary"]')
      : container.querySelector<HTMLElement>(".call-grid__tile--remote");
    expect(participant).not.toBeNull();
    act(() => participant!.click());

    const main = container.querySelector('[data-focus-main="Alex Morgan"]');
    expect(main).not.toBeNull();
    expect(main?.closest(".call-preview-panel")).not.toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label^="Fullscreen:"]')).toBeNull();
    expect(container.querySelector(".call-preview-fullscreen-backdrop")).toBeNull();
    expect(main?.querySelector(".call-preview-avatar")?.textContent?.trim()).toBe("A");
    expect(main?.querySelector("video")).toBeNull();
    const compactParticipants = Array.from(container.querySelectorAll<HTMLElement>(".call-preview-focus-participant"));
    expect(compactParticipants.length).toBeGreaterThan(0);
    expect(compactParticipants.every((tile) => tile.style.aspectRatio === "1 / 1")).toBe(true);
  });

  it("switches focused participants and returns to the full grid with Back", () => {
    const container = mountPreview();
    click(container, "Mobile");
    act(() => container.querySelector<HTMLElement>('[data-stage-role="remote-primary"]')?.click());
    expect(container.querySelector('[data-focus-main="Alex Morgan"]')).not.toBeNull();

    const maya = container.querySelector<HTMLButtonElement>('[data-focus-participant="Maya Chen"]');
    expect(maya).not.toBeNull();
    act(() => maya?.click());
    expect(container.querySelector('[data-focus-main="Maya Chen"]')).not.toBeNull();
    expect(container.querySelector('[data-focus-main="Alex Morgan"]')).toBeNull();

    const back = container.querySelector<HTMLButtonElement>('button[aria-label="Close participant focus"]');
    expect(back).not.toBeNull();
    act(() => back?.click());
    expect(container.querySelector("[data-focus-main]")).toBeNull();
    expect(container.querySelectorAll(".call-grid__tile")).toHaveLength(3);
  });

  it("keeps desktop controls visible after 15 seconds and pointer interactions", () => {
    vi.useFakeTimers();
    const container = mountPreview();
    click(container, "Desktop");
    const controls = container.querySelector(".call-preview-control-rows") as HTMLDivElement;
    expect(controls.getAttribute("aria-hidden")).toBe("false");
    act(() => vi.advanceTimersByTime(20_000));
    expect(controls.getAttribute("aria-hidden")).toBe("false");
    const stage = container.querySelector(".shared-call-stage") as HTMLElement;
    act(() => stage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(controls.getAttribute("aria-hidden")).toBe("false");
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Toggle Microphone"]')?.click());
    expect(controls.getAttribute("aria-hidden")).toBe("false");
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
    click(container, "More options");
    clickMenuItem(container, "Screen Share");
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

  it("opens Settings, Screen Share and Stovo Intelligence from the lower mobile More menu and closes on Escape or outside click", () => {
    const container = mountPreview();
    click(container, "Mobile");
    const controls = container.querySelector(".call-preview-control-rows");
    const more = controls?.querySelector<HTMLButtonElement>('button[aria-label="More options"]');
    expect(more).not.toBeNull();

    act(() => more?.click());
    const menu = container.querySelector('[role="group"][aria-label="More call options"]');
    expect(menu).not.toBeNull();
    for (const label of ["Settings", "Screen Share", "Stovo Intelligence"]) {
      const action = Array.from(menu?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        .find((candidate) => candidate.textContent?.includes(label));
      expect(action).toBeDefined();
      expect(action?.getAttribute("role")).toBeNull();
      expect(action?.tabIndex).toBe(0);
    }
    const settings = Array.from(menu?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((candidate) => candidate.textContent?.includes("Settings"));
    act(() => settings?.focus());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).toBeNull();
    expect(document.activeElement).toBe(more);

    act(() => more?.click());
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).not.toBeNull();
    act(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).toBeNull();
  });

  it("opens the existing audio/video settings UI when Settings is selected from the mobile More menu", () => {
    const container = mountPreview();
    click(container, "Mobile");
    act(() => container.querySelector<HTMLButtonElement>('.call-preview-control-rows [aria-label="More options"]')?.click());
    clickMenuItem(container, "Settings");

    expect(container.querySelector('[role="dialog"][aria-label="Audio settings"], [role="dialog"][aria-label="Video settings"]')).not.toBeNull();
  });

  it("starts screen sharing when Screen Share is selected from the mobile More menu", () => {
    const container = mountPreview();
    click(container, "Mobile");
    act(() => container.querySelector<HTMLButtonElement>('.call-preview-control-rows [aria-label="More options"]')?.click());
    clickMenuItem(container, "Screen Share");

    expect(container.querySelector('[data-preview-screen-share="true"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Stop sharing"]')).not.toBeNull();
  });

  it("opens the Stovo Intelligence popover when selected from the mobile More menu", () => {
    const container = mountPreview();
    click(container, "Mobile");
    act(() => container.querySelector<HTMLButtonElement>('.call-preview-control-rows [aria-label="More options"]')?.click());
    clickMenuItem(container, "Stovo Intelligence");

    expect(container.querySelector('[role="dialog"][aria-label="Meeting Intelligence Controls"]')).not.toBeNull();
  });

  it("minimizes from a standalone SVG control in the call header", () => {
    const container = mountPreview();
    const minimize = container.querySelector<HTMLButtonElement>('.call-preview-header button[aria-label="Minimize call"]');
    expect(minimize).not.toBeNull();
    expect(minimize?.querySelector("svg")).not.toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    act(() => minimize?.click());
    expect(container.querySelector('[aria-label="Restore call"]')).not.toBeNull();
  });

  it("uses a remote full-stage and a local bottom-right PiP on mobile, with an overlay Flip action", () => {
    const container = mountPreview();
    click(container, "Mobile");
    expect(container.querySelector('[data-stage-role="local-pip"]')).toBeNull();
    click(container, "Toggle Camera");

    const remote = container.querySelector('[data-stage-role="remote-primary"]');
    const pip = container.querySelector<HTMLElement>(".call-preview-stage-pip-wrap");
    expect(remote).not.toBeNull();
    expect(pip).not.toBeNull();
    expect(pip?.classList.contains("bottom-right")).toBe(true);
    const stageToggle = pip?.querySelector<HTMLButtonElement>('button[data-stage-role="local-pip"]');
    expect(stageToggle?.getAttribute("role")).toBe("button");
    expect(stageToggle?.tabIndex).toBe(0);
    const flip = pip?.querySelector<HTMLButtonElement>('[aria-label="Flip camera"]');
    expect(flip).not.toBeNull();
    expect(flip?.closest("button.call-preview-stage-pip")).toBeNull();
    expect(pip?.querySelector(".call-preview-camera-feed")?.classList.contains("is-back-camera")).toBe(false);
    act(() => flip?.click());
    expect(flip?.getAttribute("aria-pressed")).toBe("true");
    expect(pip?.querySelector(".call-preview-camera-feed")?.classList.contains("is-back-camera")).toBe(true);
    expect(container.querySelector('[data-stage-role="remote-primary"]')).not.toBeNull();
    expect(container.querySelector('[data-stage-role="local-pip"]')).not.toBeNull();

    act(() => stageToggle?.click());
    expect(container.querySelector('[data-stage-role="local-primary"]')).not.toBeNull();
    expect(container.querySelector('[data-stage-role="remote-pip"]')).not.toBeNull();
  });

  it.each([
    { key: "Enter", activation: "keydown" },
    { key: " ", activation: "keyup" },
  ])("supports keyboard PiP swap with $key without nesting the Flip button", ({ key, activation }) => {
    const container = mountPreview();
    click(container, "Mobile");
    click(container, "Toggle Camera");
    const pip = container.querySelector<HTMLElement>(".call-preview-stage-pip-wrap");
    const stageToggle = pip?.querySelector<HTMLButtonElement>('button[data-stage-role="local-pip"]');
    const flip = pip?.querySelector<HTMLButtonElement>('[aria-label="Flip camera"]');
    expect(stageToggle?.getAttribute("role")).toBe("button");
    expect(stageToggle?.tabIndex).toBe(0);
    expect(flip?.tagName).toBe("BUTTON");
    expect(flip?.closest("button.call-preview-stage-pip")).toBeNull();

    act(() => stageToggle?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    if (activation === "keyup") {
      expect(container.querySelector('button[data-stage-role="local-pip"]')).not.toBeNull();
      act(() => stageToggle?.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true })));
    }
    expect(container.querySelector('[data-stage-role="local-primary"]')).not.toBeNull();
    expect(container.querySelector('[data-stage-role="remote-pip"]')).not.toBeNull();
  });

  it("keeps Flip independently available when self-view is the fullscreen primary", () => {
    const container = mountPreview();
    click(container, "Mobile");
    click(container, "Toggle Camera");
    const localPip = container.querySelector<HTMLButtonElement>('button[data-stage-role="local-pip"]');
    act(() => localPip?.click());

    const localPrimary = container.querySelector<HTMLButtonElement>('button[data-stage-role="local-primary"]');
    const flip = container.querySelector<HTMLButtonElement>('button[aria-label="Flip camera"]');
    expect(localPrimary).not.toBeNull();
    expect(container.querySelector('[data-stage-role="remote-pip"]')).not.toBeNull();
    expect(flip).not.toBeNull();
    expect(flip?.closest('button[data-stage-role="local-primary"]')).toBeNull();
    expect(localPrimary?.querySelector(".call-preview-camera-feed")?.classList.contains("is-back-camera")).toBe(false);

    act(() => flip?.click());
    expect(flip?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-stage-role="local-primary"] .call-preview-camera-feed')?.classList.contains("is-back-camera")).toBe(true);
    expect(container.querySelector('button[data-stage-role="local-primary"]')).not.toBeNull();
    expect(container.querySelector('[data-stage-role="remote-pip"]')).not.toBeNull();
  });

  it("shows square avatar or video participant cards during screen share on desktop and mobile", () => {
    for (const viewport of ["Desktop", "Mobile"]) {
      const container = mountPreview();
      click(container, viewport);
      if (viewport === "Mobile") {
        click(container, "More options");
        clickMenuItem(container, "Screen Share");
      } else {
        click(container, "Share screen");
      }
      const cards = Array.from(container.querySelectorAll<HTMLElement>(".call-preview-share-participant"));
      expect(cards.length).toBeGreaterThan(1);
      expect(cards.every((card) => card.style.aspectRatio === "1 / 1")).toBe(true);
      expect(cards.every((card) => Boolean(card.querySelector(".call-preview-avatar, video")))).toBe(true);
    }
  });

  it("keeps square avatar fallbacks visible in screen-share-only mode with camera disabled", () => {
    const container = mountPreview();
    click(container, "Mobile");
    expect(container.querySelector('[aria-label="Flip camera"]')).toBeNull();
    click(container, "More options");
    clickMenuItem(container, "Screen Share");
    expect(container.querySelector('[data-preview-screen-share="true"]')).not.toBeNull();
    expect(container.querySelector('[data-stage-role="local-pip"]')).toBeNull();
    const cards = Array.from(container.querySelectorAll<HTMLElement>(".call-preview-share-participant"));
    expect(cards.length).toBeGreaterThan(1);
    expect(cards.every((card) => card.style.aspectRatio === "1 / 1")).toBe(true);
    expect(cards.every((card) => card.querySelector(".call-preview-avatar") !== null)).toBe(true);
  });

  it("keeps the desktop call mockup in its one-row control layout", () => {
    const container = mountPreview();
    const rows = container.querySelectorAll(".call-preview-control-row");
    expect(container.querySelector(".call-preview-control-rows")?.getAttribute("data-layout")).toBe("desktop-one-row");
    expect(rows).toHaveLength(1);
    for (const label of ["Toggle Microphone", "Toggle Speaker", "Toggle Camera", "Audio settings", "Share screen", "End call"]) {
      expect(rows[0].querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
    expect(rows[0].querySelector('[aria-label="More options"]')).toBeNull();
  });

  it("auto-hides call controls after 15 seconds and reveals them after tapping the stage", () => {
    vi.useFakeTimers();
    const container = mountPreview();
    click(container, "Mobile");
    const controls = container.querySelector(".call-preview-control-rows") as HTMLDivElement;
    expect(controls.getAttribute("aria-hidden")).toBe("false");
    act(() => vi.advanceTimersByTime(15_000));
    expect(controls.getAttribute("aria-hidden")).toBe("true");
    const stage = container.querySelector(".call-popup-video-area") as HTMLDivElement;
    act(() => stage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(controls.getAttribute("aria-hidden")).toBe("false");
  });
});
