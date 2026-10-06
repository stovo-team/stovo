import { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CALL_SETTINGS, type CallCapabilities } from "../../../realtime/call/types";
import { CallAudioSettingsPopup } from "./CallAudioSettingsPopup";

const mountedRoots: Root[] = [];
afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => root?.unmount());
  }
  document.body.innerHTML = "";
});
const capabilities: CallCapabilities = {
  canSelectInputDevice: true,
  canSelectOutputDevice: true,
  canUseNoiseSuppression: true,
  canUseEchoCancellation: true,
  canUseAutoGainControl: true,
  canUseVoiceEnhancement: true,
  canUseCamera: true,
  canShareScreen: true,
};

describe("desktop call device selection", () => {
  it("uses the theme accent for audio sliders and a fixed fully-rounded bordered close control", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    act(() => root.render(
      <CallAudioSettingsPopup
        popupRef={{ current: null }}
        isMobile={false}
        settings={DEFAULT_CALL_SETTINGS}
        capabilities={capabilities}
        devices={[]}
        trackStatus={null}
        warning={null}
        onPatch={vi.fn()}
        onClose={vi.fn()}
      />,
    ));

    const slider = container.querySelector<HTMLInputElement>('.call-audio-slider-row input[type="range"]');
    const close = container.querySelector<HTMLButtonElement>(".call-audio-popup-close");
    expect(slider).not.toBeNull();
    expect(close).not.toBeNull();
    expect(css).toMatch(/\.call-audio-slider-row input\[type="range"\]\s*\{[^}]*accent-color:\s*var\(--accent-primary\)/s);
    const closeRule = css.match(/\.call-audio-popup-close\s*\{([^}]*)\}/s)?.[1] ?? "";
    expect(closeRule).toMatch(/background:\s*(?:var\(--(?:surface-hover|background-secondary)\)|color-mix\()/);
    expect(closeRule).toMatch(/border:\s*1px solid var\(--border-default\)/);
    expect(closeRule).toMatch(/border-radius:\s*999px/);
    expect(closeRule).toMatch(/width:\s*36px/);
    expect(closeRule).toMatch(/height:\s*36px/);
    expect(closeRule).toMatch(/(?:flex:\s*0\s+0\s+36px|flex-shrink:\s*0)/);
  });

  it("uses the shared device dropdowns and applies the selected devices", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    act(() => root.render(
      <CallAudioSettingsPopup
        popupRef={{ current: null }}
        isMobile={false}
        settings={DEFAULT_CALL_SETTINGS}
        capabilities={capabilities}
        devices={[
          { deviceId: "mic-1", kind: "audioinput", label: "Desk microphone" },
          { deviceId: "speaker-1", kind: "audiooutput", label: "Desk speakers" },
        ]}
        trackStatus={null}
        warning={null}
        onPatch={onPatch}
        onClose={vi.fn()}
      />,
    ));

    const microphone = container.querySelector<HTMLButtonElement>('[aria-label="Select Microphone"]');
    const speaker = container.querySelector<HTMLButtonElement>('[aria-label="Select Speaker"]');
    expect(microphone).not.toBeNull();
    expect(speaker).not.toBeNull();
    act(() => microphone?.click());
    const dialog = container.querySelector('[role="dialog"][aria-modal="true"]');
    const micMenu = dialog?.querySelector('[role="listbox"][aria-label="Microphone device"]');
    expect(micMenu).not.toBeNull();
    expect(micMenu?.parentElement).toBe(dialog);
    expect(document.body.querySelector('[role="listbox"]')).toBe(micMenu);
    const micOption = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
      .find((option) => option.textContent?.includes("Desk microphone"));
    act(() => micOption?.click());
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();

    act(() => speaker?.click());
    expect(document.body.querySelector('[role="listbox"][aria-label="Speaker device"]')).not.toBeNull();
    const speakerOption = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((option) => option.textContent?.includes("Desk speakers"));
    act(() => speakerOption?.click());
    expect(onPatch).toHaveBeenNthCalledWith(1, { inputDeviceId: "mic-1" });
    expect(onPatch).toHaveBeenNthCalledWith(2, { outputDeviceId: "speaker-1" });
  });

  it("closes settings device menus on Escape and outside clicks", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    act(() => root.render(
      <CallAudioSettingsPopup
        popupRef={{ current: null }}
        isMobile={false}
        settings={DEFAULT_CALL_SETTINGS}
        capabilities={capabilities}
        devices={[{ deviceId: "mic-1", kind: "audioinput", label: "Desk microphone" }]}
        trackStatus={null}
        warning={null}
        onPatch={vi.fn()}
        onClose={vi.fn()}
      />,
    ));

    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Select Microphone"]');
    act(() => trigger?.click());
    act(() => trigger?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(document.activeElement).toBe(container.querySelector('[role="option"]'));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    act(() => trigger?.click());
    act(() => document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  });

  it("separates microphone processing from speaker output controls without extra boxed rows or browser tags", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    act(() => root.render(
      <CallAudioSettingsPopup
        popupRef={{ current: null }}
        isMobile
        settings={DEFAULT_CALL_SETTINGS}
        capabilities={capabilities}
        devices={[
          { deviceId: "mic-1", kind: "audioinput", label: "Desk microphone" },
          { deviceId: "speaker-1", kind: "audiooutput", label: "Desk speakers" },
        ]}
        trackStatus={null}
        warning={null}
        onPatch={onPatch}
        onClose={vi.fn()}
      />,
    ));

    const microphone = container.querySelector<HTMLElement>('.call-audio-popup-section[aria-label="Microphone settings"]');
    const speaker = container.querySelector<HTMLElement>('.call-audio-popup-section[aria-label="Speaker settings"]');
    expect(microphone).not.toBeNull();
    expect(speaker).not.toBeNull();
    expect(microphone?.textContent).toContain("Input gain");
    expect(microphone?.textContent).not.toContain("Noise suppression");
    const dynamics = container.querySelector<HTMLElement>('.call-audio-popup-section[aria-label="Dynamic settings"]');
    expect(dynamics?.textContent).toContain("Noise suppression");
    expect(dynamics?.textContent).toContain("Echo cancellation");
    expect(dynamics?.textContent).toContain("Auto gain control");
    expect(dynamics?.textContent).toContain("Voice enhancement");
    expect(dynamics?.textContent).toContain("Speaking sensitivity");
    expect(speaker?.textContent).toContain("Output volume");
    expect(speaker?.querySelector('[role="group"][aria-label="Speaker mode"]')).not.toBeNull();
    expect(speaker?.textContent).not.toContain("Noise suppression");
    expect(container.querySelectorAll(".call-audio-badge, .call-audio-status-chip")).toHaveLength(0);

    const sensitivity = dynamics?.querySelector<HTMLInputElement>('[aria-label="Speaking sensitivity"]');
    expect(sensitivity?.value).toBe("8");
    act(() => {
      if (sensitivity) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(sensitivity, "5");
        sensitivity.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(onPatch).toHaveBeenCalledWith({ speakingSensitivity: 5 });

    const css = readFileSync("src/styles.css", "utf8");
    const toggleRule = css.match(/\.call-audio-toggle-row\s*\{([^}]*)\}/s)?.[1] ?? "";
    expect(toggleRule).toMatch(/border:\s*0(?:\s|;)/);
    expect(toggleRule).toMatch(/background:\s*transparent/);
    expect(css).not.toMatch(/\.call-audio-popup-divider\s*\{/);
  });

});
