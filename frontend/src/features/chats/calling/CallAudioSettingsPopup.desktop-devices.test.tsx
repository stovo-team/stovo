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

  it("keeps a narrow device list below its trigger even near the bottom of the viewport", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    act(() => root.render(<CallAudioSettingsPopup popupRef={{ current: null }} isMobile={false}
      settings={DEFAULT_CALL_SETTINGS} capabilities={capabilities} devices={[]}
      warning={null} onPatch={vi.fn()} onClose={vi.fn()} />));
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Select Speaker"]')!;
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: window.innerHeight - 100, bottom: window.innerHeight - 60, left: 50, right: 230,
      width: 180, height: 40, x: 50, y: window.innerHeight - 100, toJSON: () => ({}),
    });
    act(() => trigger.click());
    const menu = container.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(menu.style.top).toBe(`${window.innerHeight - 54}px`);
    expect(menu.style.left).toBe("50px");
    expect(menu.style.width).toBe("180px");
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(54);
  });

  it("starts at audible volume and plays the speaker test through the chosen output", async () => {
    const ramp = vi.fn();
    const sink = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const start = vi.fn();
    const AudioContextMock = vi.fn(function () { return {
      state: "running", currentTime: 0, destination: {}, close, setSinkId: sink,
      createOscillator: () => ({ frequency: { value: 0 }, connect: vi.fn(), start, stop: vi.fn() }),
      createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: ramp }, connect: vi.fn() }),
    }; });
    vi.stubGlobal("AudioContext", AudioContextMock);
    try {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      mountedRoots.push(root);
      const render = (outputVolume: number) => act(() => root.render(<CallAudioSettingsPopup
        popupRef={{ current: null }} isMobile={false} settings={{ ...DEFAULT_CALL_SETTINGS, outputDeviceId: "speaker-1", outputVolume }}
        capabilities={capabilities} devices={[]} warning={null} onPatch={vi.fn()} onClose={vi.fn()} />));
      render(DEFAULT_CALL_SETTINGS.outputVolume);
      expect(container.querySelector<HTMLInputElement>('[aria-label="Output volume"]')?.value).toBe("100");
      expect(container.textContent).toContain("Microphone test");
      const testSound = container.querySelector<HTMLButtonElement>('[aria-label="Test sound"]');
      expect(testSound).not.toBeNull();
      await act(async () => { testSound?.click(); });
      expect(sink).toHaveBeenCalledWith("speaker-1");
      expect(start).toHaveBeenCalledTimes(3);
      expect(ramp).toHaveBeenCalledWith(0.25, 0.02);
      render(0);
      expect(container.querySelector<HTMLButtonElement>('[aria-label="Test sound"]')?.disabled).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });

  it("meters the existing microphone stream and releases the test when muted", () => {
    const close = vi.fn(async () => undefined);
    const source = vi.fn(() => ({ connect: vi.fn() }));
    vi.stubGlobal("AudioContext", vi.fn(function () { return {
      state: "running", close, createMediaStreamSource: source,
      createAnalyser: () => ({ fftSize: 256, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(160) }),
    }; }));
    try {
      const stream = { getAudioTracks: () => [{}] } as unknown as MediaStream;
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      mountedRoots.push(root);
      const render = (micMuted: boolean) => act(() => root.render(<CallAudioSettingsPopup
        popupRef={{ current: null }} isMobile={false} localStream={stream}
        settings={{ ...DEFAULT_CALL_SETTINGS, micMuted }} capabilities={capabilities} devices={[]}
        warning={null} onPatch={vi.fn()} onClose={vi.fn()} />));
      render(false);
      expect(source).toHaveBeenCalledWith(stream);
      expect(container.querySelector('[role="meter"]')?.getAttribute("aria-valuenow")).toBe("45");
      render(true);
      expect(close).toHaveBeenCalledOnce();
      expect(container.querySelector('[role="meter"]')).toBeNull();
      expect(container.textContent).toContain("Microphone muted");
    } finally { vi.unstubAllGlobals(); }
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
