import { act } from "react";
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
});
