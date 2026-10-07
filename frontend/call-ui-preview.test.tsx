import { act } from "react";
import { readFileSync } from "node:fs";
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

function previewCssRules(selector: string) {
  const html = readFileSync("call-ui-preview.html", "utf8");
  const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")), (match) => match[1]).join("\n");
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

  it("minimizes from the standalone header control without a desktop More trigger", () => {
    const container = mountPreview();
    expect(container.querySelector('.call-preview-header button[aria-label="More options"]')).toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();
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

    const back = container.querySelector<HTMLButtonElement>('button[aria-label="Back to participants"]');
    expect(back).not.toBeNull();
    act(() => back?.click());
    expect(container.querySelector("[data-focus-main]")).toBeNull();
    expect(container.querySelectorAll(".call-grid__tile")).toHaveLength(3);
  });

  it("keeps the focused header compact: no speaking/status decoration and adjacent SVG back/minimize controls", () => {
    const container = mountPreview();
    click(container, "Mobile");
    act(() => container.querySelector<HTMLElement>('[data-stage-role="remote-primary"]')?.click());

    const header = container.querySelector<HTMLElement>(".call-preview-focus-header");
    expect(header).not.toBeNull();
    expect(header?.querySelector(".speaking-ring, .speaking-ellipsis, [data-speaking], [aria-label*=Speaking]")).toBeNull();
    expect(container.querySelector(".call-grid__tile.is-speaking")).toBeNull();
    expect(header?.querySelector("[data-participant-status]")).toBeNull();
    expect(header?.querySelector("[aria-label='Back to participants'] svg")).not.toBeNull();
    expect(container.querySelector(".call-preview-focus-close")).toBeNull();
    expect(container.querySelectorAll("[aria-label='Back to participants']")).toHaveLength(1);
    expect(header?.querySelector("[aria-label='Minimize call'] svg")).not.toBeNull();
    const back = header?.querySelector("[aria-label='Back to participants']");
    const minimize = header?.querySelector("[aria-label='Minimize call']");
    expect(back?.parentElement).toBe(minimize?.parentElement);
    expect(header?.getAttribute("data-narrow-layout")).toBe("compact");
  });

  it("keeps participant status while omitting speaking rings from focused content", () => {
    const container = mountPreview();
    click(container, "Mobile");
    act(() => container.querySelector<HTMLElement>('[data-stage-role="remote-primary"]')?.click());
    const main = container.querySelector<HTMLElement>(".call-preview-focus-main");
    expect(main).not.toBeNull();
    expect(main?.querySelector(".call-grid__tile.is-speaking, .speaking-ring, .speaking-ellipsis")).toBeNull();
    expect(main?.querySelector(":scope > span")?.textContent).toBe("Connected");
  });

  it("does not expose call minimization in the Guest meeting surface", () => {
    const container = mountPreview();
    const guestMeeting = Array.from(container.querySelectorAll<HTMLButtonElement>(".call-preview-switches button"))
      .find((button) => button.textContent?.trim() === "Guest meeting");
    act(() => guestMeeting?.click());
    expect(container.querySelector('[aria-label="Minimize call"]')).toBeNull();
    expect(container.querySelector('.call-preview-header button[title="Minimize call"]')).toBeNull();
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

  it("shows screen sharing as the full-view surface and does not make it a focus action", () => {
    const container = mountPreview();
    click(container, "Share screen");
    const screen = container.querySelector<HTMLElement>('[data-preview-screen-share="true"]');
    expect(screen).not.toBeNull();
    expect(screen?.closest("button")).toBeNull();
    expect(screen?.getAttribute("role")).not.toBe("button");
    expect(container.querySelector('[aria-label="Focus shared screen"]')).toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="Fullscreen: Shared screen"]')).toBeNull();
    const initialContent = screen?.textContent;
    const initialParticipants = container.querySelectorAll(".call-preview-share-participant").length;
    act(() => screen?.click());
    expect(container.querySelector('[data-preview-screen-share="true"]')).toBe(screen);
    expect(container.querySelector('[aria-label="Focus shared screen"]')).toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="Fullscreen: Shared screen"], .call-preview-focus-stage, [data-focus-main]')).toBeNull();
    expect(screen?.textContent).toBe(initialContent);
    expect(container.querySelectorAll(".call-preview-share-participant")).toHaveLength(initialParticipants);

    click(container.querySelector(".call-preview-control-row")!, "Stop sharing");
    click(container, "Mobile");
    click(container, "More options");
    clickMenuItem(container, "Screen Share");
    expect(container.querySelector('[data-preview-screen-share="true"]')).not.toBeNull();
  });

  it.each(["Desktop", "Mobile"])('%s screen sharing stops only through the standard share toggle', (viewport) => {
    const container = mountPreview();
    click(container, viewport);
    if (viewport === "Mobile") {
      click(container, "More options");
      clickMenuItem(container, "Screen Share");
    } else {
      click(container, "Share screen");
    }
    expect(container.querySelector('[data-preview-screen-share="true"]')).not.toBeNull();
    expect(container.querySelector('.call-preview-stop-sharing, [aria-label="Stop sharing"].call-preview-stop-sharing')).toBeNull();

    if (viewport === "Desktop") {
      click(container.querySelector(".call-preview-control-row")!, "Stop sharing");
    } else {
      const more = container.querySelector<HTMLButtonElement>('.call-preview-control-rows [aria-label="More options"]');
      act(() => more?.click());
      clickMenuItem(container, "Stop sharing");
    }
    expect(container.querySelector('[data-preview-screen-share="true"]')).toBeNull();
  });

  it("uses matching Share/Stop SVG control states on desktop and mobile through a complete toggle cycle", () => {
    const rendered: Record<string, string> = {};
    for (const viewport of ["Desktop", "Mobile"]) {
      const container = mountPreview();
      click(container, viewport);
      let start: HTMLButtonElement | null;
      if (viewport === "Mobile") {
        click(container, "More options");
        start = container.querySelector<HTMLButtonElement>('[role="group"][aria-label="More call options"] [aria-label="Screen Share"]');
      } else {
        start = container.querySelector<HTMLButtonElement>('.call-preview-control-row [aria-label="Share screen"]');
      }
      expect(start).not.toBeNull();
      rendered[`${viewport}-share`] = start?.querySelector("svg")?.outerHTML ?? "";
      act(() => start?.click());
      expect(container.querySelector('[data-preview-screen-share="true"]')).not.toBeNull();
      const stop = viewport === "Mobile"
        ? container.querySelector<HTMLButtonElement>('[role="group"][aria-label="More call options"] [aria-label="Stop sharing"]')
        : container.querySelector<HTMLButtonElement>('.call-preview-control-row [aria-label="Stop sharing"]');
      expect(stop).not.toBeNull();
      rendered[`${viewport}-stop`] = stop?.querySelector("svg")?.outerHTML ?? "";
      act(() => stop?.click());
      expect(container.querySelector('[data-preview-screen-share="true"]')).toBeNull();
      const shareAgain = viewport === "Mobile"
        ? container.querySelector<HTMLButtonElement>('[role="group"][aria-label="More call options"] [aria-label="Screen Share"]')
        : container.querySelector<HTMLButtonElement>('.call-preview-control-row [aria-label="Share screen"]');
      expect(shareAgain).not.toBeNull();
      rendered[`${viewport}-share-again`] = shareAgain?.querySelector("svg")?.outerHTML ?? "";
    }
    expect(rendered["Desktop-share"]).toBe(rendered["Mobile-share"]);
    expect(rendered["Desktop-stop"]).toBe(rendered["Mobile-stop"]);
    expect(rendered["Desktop-share-again"]).toBe(rendered["Desktop-share"]);
    expect(rendered["Mobile-share-again"]).toBe(rendered["Mobile-share"]);
    expect(rendered["Desktop-stop"]).not.toBe(rendered["Desktop-share"]);
  });

  it("omits captions under More and desktop Stovo Intelligence controls", () => {
    const container = mountPreview();
    const more = container.querySelector<HTMLButtonElement>('.call-preview-control-rows [aria-label="More options"]');
    expect(more?.nextElementSibling?.textContent?.trim()).not.toBe("More");
    click(container, "Desktop");
    const intelligence = container.querySelector<HTMLButtonElement>('.call-preview-control-row [aria-label="Stovo Intelligence"]');
    expect(intelligence?.nextElementSibling?.textContent?.trim()).not.toBe("Intelligence");
  });

  it("keeps Stovo Intelligence collapsed inside More until opened", () => {
    const container = mountPreview();
    click(container, "Mobile");
    click(container, "More options");
    const menu = container.querySelector<HTMLElement>('[role="group"][aria-label="More call options"]');
    expect(menu).not.toBeNull();
    expect(menu?.querySelector('[aria-label="Stovo Intelligence"]')).not.toBeNull();
    expect(menu?.querySelector('[aria-label="Start AI Notes"]')).toBeNull();
    act(() => menu?.querySelector<HTMLButtonElement>('[aria-label="Stovo Intelligence"]')?.click());
    for (const label of ["Start AI Notes", "Start Recording"]) {
      expect(menu?.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
    expect(menu?.querySelector('[aria-label="Toggle Live Captions"]')).toBeNull();
    expect(menu?.querySelector('[aria-label="Live Captions locked"]')).not.toBeNull();
    expect(container.querySelector('[role="group"][aria-label="More call options"]')).not.toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="Meeting Intelligence Controls"]')).toBeNull();
  });

  it("keeps all three Stovo Intelligence actions available from the desktop control", () => {
    const container = mountPreview();
    click(container, "Desktop");
    click(container, "Stovo Intelligence");
    const intelligence = document.body.querySelector('[role="dialog"][aria-label="Meeting Intelligence Controls"]');
    expect(intelligence).not.toBeNull();
    for (const label of ["Start AI Notes", "Start Recording", "Toggle Live Captions"]) {
      expect(intelligence?.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
  });

  it.each([320, 360])("keeps mobile controls circular, fixed-size and equally spaced at %ipx", (width) => {
    const container = mountPreview();
    click(container, "Mobile");
    const panel = container.querySelector<HTMLElement>(".call-preview-panel")!;
    panel.style.width = `${width}px`;
    const row = container.querySelector<HTMLElement>(".call-preview-control-row")!;
    const controls = Array.from(row.querySelectorAll<HTMLElement>(".call-ctrl-btn"));
    expect(controls).toHaveLength(5);
    expect(controls.every((control) => control.dataset.shape === "circle")).toBe(true);
    expect(controls.every((control) => control.dataset.fixedSize === "true")).toBe(true);
    expect(row.dataset.equalGap).toBe("true");
    expect(row.dataset.noWrap).toBe("true");

    const panelRule = previewCssRules(".call-preview-mobile .call-preview-control-rows");
    const rowRule = previewCssRules(".call-preview-mobile .call-preview-control-row");
    const firstMobileRowRule = previewCssRules(".call-preview-mobile .call-preview-control-row:first-child");
    const buttonRule = previewCssRules(".call-preview-mobile .call-preview-control-row .call-ctrl-btn");
    expect(panelRule).toMatch(/border-radius:\s*999px/);
    expect(rowRule).toMatch(/flex-wrap:\s*nowrap/);
    expect(rowRule).toMatch(/grid-template-columns:\s*repeat\(5,\s*48px\)/);
    expect(firstMobileRowRule).toMatch(/justify-content:\s*space-between/);
    expect(buttonRule).toMatch(/width:\s*48px/);
    expect(buttonRule).toMatch(/height:\s*48px/);
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

  it("opens Settings, Screen Share and collapsed Stovo Intelligence from the lower mobile More menu and closes on Escape or outside click", () => {
    const container = mountPreview();
    click(container, "Mobile");
    const controls = container.querySelector(".call-preview-control-rows");
    const more = controls?.querySelector<HTMLButtonElement>('button[aria-label="More options"]');
    expect(more).not.toBeNull();

    act(() => more?.click());
    const menu = container.querySelector('[role="group"][aria-label="More call options"]');
    expect(menu).not.toBeNull();
    for (const label of ["Settings", "Screen Share", "Stovo Intelligence"]) {
      const action = menu?.querySelector<HTMLElement>(`[aria-label="${label}"]`)
        ?? Array.from(menu?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((candidate) => candidate.textContent?.includes(label));
      expect(action, `expected mobile More action ${label}`).toBeDefined();
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

  it("shows Stovo Intelligence collapsed in the mobile More menu", () => {
    const container = mountPreview();
    click(container, "Mobile");
    act(() => container.querySelector<HTMLButtonElement>('.call-preview-control-rows [aria-label="More options"]')?.click());
    const menu = container.querySelector('[role="group"][aria-label="More call options"]');
    expect(menu?.querySelector('[aria-label="Start AI Notes"]')).toBeNull();
    expect(menu?.querySelector('[aria-label="Stovo Intelligence"]')).not.toBeNull();
    act(() => menu?.querySelector<HTMLButtonElement>('[aria-label="Stovo Intelligence"]')?.click());
    expect(menu?.querySelector('[aria-label="Start AI Notes"]')).not.toBeNull();
    expect(menu?.querySelector('[aria-label="Start Recording"]')).not.toBeNull();
    expect(menu?.querySelector('[aria-label="Live Captions locked"]')).not.toBeNull();
    expect(menu?.querySelector('[aria-label="Toggle Live Captions"]')).toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="Meeting Intelligence Controls"]')).toBeNull();
  });

  it("anchors the mobile More menu to the left edge of its control and keeps it within the viewport", () => {
    const container = mountPreview();
    click(container, "Mobile");
    click(container, "More options");
    const menu = container.querySelector<HTMLElement>('[role="group"][aria-label="More call options"]');
    expect(menu).not.toBeNull();
    expect(menu?.closest(".call-preview-more-anchor")).not.toBeNull();
    const rule = previewCssRules(".call-preview-mobile-menu");
    expect(rule).toMatch(/left:\s*0/);
    expect(rule).toMatch(/right:\s*auto/);
    expect(rule).toMatch(/max-width:\s*min\(/);
  });

  it("enters mobile landscape for a screen share, hides participant tiles, keeps controls, and closes back to portrait", () => {
    const container = mountPreview();
    click(container, "Mobile");
    click(container, "More options");
    clickMenuItem(container, "Screen Share");
    expect(container.querySelector('[data-mobile-orientation="portrait"]')).not.toBeNull();
    expect(container.querySelector('.call-preview-share-participants')).not.toBeNull();
    const rotate = container.querySelector<HTMLButtonElement>('[aria-label="Rotate landscape"]');
    expect(rotate).not.toBeNull();
    act(() => rotate?.click());

    expect(container.querySelector('[data-mobile-orientation="landscape"]')).not.toBeNull();
    expect(container.querySelector('[data-mobile-orientation="landscape"] .call-preview-share-participants')).toBeNull();
    expect(container.querySelector('[data-mobile-orientation="landscape"] .call-preview-control-rows')).not.toBeNull();
    const close = container.querySelector<HTMLButtonElement>('[aria-label="Close landscape view"]');
    expect(close).not.toBeNull();
    act(() => close?.click());
    expect(container.querySelector('[data-mobile-orientation="portrait"]')).not.toBeNull();
    expect(container.querySelector('.call-preview-control-rows [aria-label="More options"]')).not.toBeNull();
    expect(container.querySelector('.call-preview-share-participants')).not.toBeNull();
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
    const pipRule = previewCssRules(".call-preview-stage-pip-wrap");
    expect(pipRule).toMatch(/border-radius:\s*(?:8|9)px/);
    expect(pipRule).not.toMatch(/border-radius:\s*50%/);
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

  it.each(["Desktop", "Mobile"]) ("keeps square avatar fallbacks in screen-share-only mode with camera disabled on %s", (viewport) => {
    const container = mountPreview();
    click(container, viewport);
    expect(container.querySelector('[aria-label="Flip camera"]')).toBeNull();
    if (viewport === "Mobile") {
      click(container, "More options");
      clickMenuItem(container, "Screen Share");
    } else {
      click(container, "Share screen");
    }
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
