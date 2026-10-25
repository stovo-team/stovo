import { readCssSource } from "../../../test/cssSource";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CallSettingsDialog } from "./CallSettingsDialog";
import type { CallCapabilities, CallDevice, CallSettings } from "../../../realtime/CallController";

const roots: Root[] = [];
const settings = { inputGain: 100, outputVolume: 70, inputDeviceId: "", outputDeviceId: "", videoDeviceId: "", mirrorLocalVideo: true, micMuted: false, soundDisabled: false, speakingSensitivity: 10, noiseSuppression: true, echoCancellation: true, autoGainControl: true, voiceEnhancement: false, voiceEnhancementThreshold: -24, voiceEnhancementHighpass: 100, speakerMode: "large" } as CallSettings;
const capabilities = { canSelectInputDevice: false, canSelectOutputDevice: false, canUseNoiseSuppression: false, canUseEchoCancellation: false, canUseAutoGainControl: false, canUseVoiceEnhancement: false, canUseCamera: false, canShareScreen: false } as CallCapabilities;
const devices: CallDevice[] = [];
afterEach(() => { while (roots.length) act(() => roots.pop()?.unmount()); document.body.innerHTML = ""; });

describe("CallSettingsDialog", () => {
  it("uses the same General preference switch as the Audio settings", () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    act(() => root.render(<CallSettingsDialog initialTab="general" preferences={{ autoHideControls: false, cameraFit: "fit" }} settings={settings} capabilities={capabilities} devices={devices} warning={null} onPatch={() => undefined} onPreferencePatch={() => undefined} onClose={() => undefined} isMobile={false} />));
    expect(host.querySelector('.call-audio-toggle-switch input[aria-label="Hide call controls automatically"]')).toBeTruthy();
    expect(host.querySelector('.call-audio-toggle-switch .call-audio-toggle-slider')).toBeTruthy();
  });
  it("uses a fixed-height settings shell with a scrollable active tab panel", () => {
    const css = readCssSource("src/styles.css");
    const dialog = css.match(/\.call-settings-dialog\s*\{([^}]*)\}/)?.[1] ?? "";
    const layout = css.match(/\.call-settings-dialog-layout\s*\{([^}]*)\}/)?.[1] ?? "";
    const panel = css.match(/\.call-settings-panel-wrap\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(dialog).toMatch(/height:\s*min\(/);
    expect(layout).toMatch(/flex:\s*1/);
    expect(panel).toMatch(/overflow:\s*auto/);
  });

  it("anchors the shared close button to the settings dialog", () => {
    const css = readCssSource("src/styles.css");
    const dialog = css.match(/\.call-settings-dialog\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(dialog).toMatch(/position:\s*relative/);
  });
  it("starts on General and switches between General, Audio and Camera tabs", () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    act(() => root.render(<CallSettingsDialog initialTab="general" preferences={{ autoHideControls: false, cameraFit: "fit" }} settings={settings} capabilities={capabilities} devices={devices} warning={null} onPatch={() => undefined} onPreferencePatch={() => undefined} onClose={() => undefined} isMobile={false} />));
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("General");
    act(() => host.querySelector<HTMLButtonElement>('[role="tab"]:nth-child(2)')?.click());
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Audio");
    expect(host.querySelector('[aria-label="Audio settings"]')).toBeTruthy();
    act(() => host.querySelector<HTMLButtonElement>('[role="tab"]:nth-child(3)')?.click());
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Camera");
    expect(host.querySelector('[aria-label="Camera settings"]')).toBeTruthy();
  });
  it("keeps the dialog open while changing an audio device from its dropdown", () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    const onClose = vi.fn();
    const onPatch = vi.fn();
    act(() => root.render(<CallSettingsDialog initialTab="audio" preferences={{ autoHideControls: false, cameraFit: "fit" }} settings={settings} capabilities={{ ...capabilities, canSelectInputDevice: true }} devices={[{ deviceId: "mic-1", kind: "audioinput", label: "Desk microphone" }]} warning={null} onPatch={onPatch} onPreferencePatch={() => undefined} onClose={onClose} isMobile={false} />));

    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Select Microphone"]');
    expect(trigger).not.toBeNull();
    act(() => trigger?.click());
    const option = host.querySelector<HTMLButtonElement>('[role="option"][aria-selected="false"]');
    expect(option?.textContent).toContain("Desk microphone");
    act(() => option?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    act(() => option?.click());

    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(onPatch).toHaveBeenCalledWith({ inputDeviceId: "mic-1" });
  });
  it("contains pointer presses so the chat outside-click handler cannot dismiss settings", () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    const outsideMouseDown = vi.fn();
    document.addEventListener("mousedown", outsideMouseDown);
    try {
      act(() => root.render(<CallSettingsDialog initialTab="general" preferences={{ autoHideControls: false, cameraFit: "fit" }} settings={settings} capabilities={capabilities} devices={devices} warning={null} onPatch={() => undefined} onPreferencePatch={() => undefined} onClose={() => undefined} isMobile={false} />));
      const audioTab = host.querySelector<HTMLButtonElement>('[role="tab"][id$="audio"]')!;
      act(() => audioTab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
      act(() => audioTab.click());
      expect(outsideMouseDown).not.toHaveBeenCalled();
      expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Audio");
    } finally {
      document.removeEventListener("mousedown", outsideMouseDown);
    }
  });
  it("supports arrow-key navigation across the settings tabs", () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    act(() => root.render(<CallSettingsDialog initialTab="general" preferences={{ autoHideControls: false, cameraFit: "fit" }} settings={settings} capabilities={capabilities} devices={devices} warning={null} onPatch={() => undefined} onPreferencePatch={() => undefined} onClose={() => undefined} isMobile={false} />));
    const general = host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
    act(() => general.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Audio");
    act(() => host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Camera");
  });
  it("writes general and camera framing preferences through the shared callback", () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    const onPreferencePatch = vi.fn();
    act(() => root.render(<CallSettingsDialog initialTab="general" preferences={{ autoHideControls: false, cameraFit: "fit" }} settings={settings} capabilities={capabilities} devices={devices} warning={null} onPatch={() => undefined} onPreferencePatch={onPreferencePatch} onClose={() => undefined} isMobile={false} />));
    act(() => host.querySelector<HTMLInputElement>('[aria-label="Hide call controls automatically"]')?.click());
    expect(onPreferencePatch).toHaveBeenLastCalledWith({ autoHideControls: true });
    act(() => host.querySelector<HTMLButtonElement>('[role="tab"][id$="camera"]')?.click());
    act(() => host.querySelector<HTMLInputElement>('input[value="cover"]')?.click());
    expect(onPreferencePatch).toHaveBeenLastCalledWith({ cameraFit: "cover" });
  });
  it("closes from Escape and restores focus to the control that opened settings", () => {
    const opener = document.createElement("button"); opener.textContent = "Open settings"; document.body.append(opener); opener.focus();
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    const onClose = vi.fn();
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    act(() => root.render(<CallSettingsDialog initialTab="general" preferences={{ autoHideControls: false, cameraFit: "fit" }} settings={settings} capabilities={capabilities} devices={devices} warning={null} onPatch={() => undefined} onPreferencePatch={() => undefined} onClose={onClose} isMobile={false} />));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
    requestFrame.mockRestore();
  });
  it("keeps Tab focus inside the modal dialog", () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); roots.push(root);
    act(() => root.render(<CallSettingsDialog initialTab="general" preferences={{ autoHideControls: false, cameraFit: "fit" }} settings={settings} capabilities={capabilities} devices={devices} warning={null} onPatch={() => undefined} onPreferencePatch={() => undefined} onClose={() => undefined} isMobile={false} />));
    const close = host.querySelector<HTMLButtonElement>('[aria-label="Close"]')!;
    const last = host.querySelector<HTMLInputElement>('[aria-label="Hide call controls automatically"]')!;
    act(() => close.focus());
    act(() => close.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(document.activeElement).toBe(last);
    act(() => last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(close);
  });
});
