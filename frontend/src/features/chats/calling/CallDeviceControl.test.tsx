import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CallDeviceControl } from "./CallDeviceControl";
import { CallDeviceControls } from "./CallDeviceControls";
import { DEFAULT_CALL_SETTINGS, type CallCapabilities } from "../../../realtime/call/types";

const mountedRoots: Root[] = [];

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => root?.unmount());
  }
  document.body.innerHTML = "";
});

function mount(ui: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => root.render(ui));
  return container;
}

describe("CallDeviceControl", () => {
  it("keeps the toggle separate from device selection and filters choices to the control kind", () => {
    const onToggle = vi.fn();
    const onDeviceChange = vi.fn();
    const container = mount(
      <CallDeviceControl
        action="camera"
        label="Camera"
        active={false}
        deviceKind="videoinput"
        selectedDeviceId=""
        devices={[
          { deviceId: "camera-1", kind: "videoinput", label: "Front camera" },
          { deviceId: "mic-1", kind: "audioinput", label: "Microphone" },
        ]}
        onToggle={onToggle}
        onDeviceChange={onDeviceChange}
      />,
    );
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="Toggle Camera"]');
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Select Camera"]');
    act(() => toggle?.click());
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onDeviceChange).not.toHaveBeenCalled();

    act(() => trigger?.click());
    expect(container.querySelector('[role="option"]')?.textContent).toContain("System default");
    expect(Array.from(container.querySelectorAll('[role="option"]')).map((option) => option.textContent).join(" ")).toContain("Front camera");
    expect(Array.from(container.querySelectorAll('[role="option"]')).map((option) => option.textContent).join(" ")).not.toContain("Microphone");
  });

  it("opens a device dropdown, selects a device, and returns focus to its trigger", () => {
    const onDeviceChange = vi.fn();
    const container = mount(
      <CallDeviceControl
        action="microphone"
        label="Microphone"
        active
        deviceKind="audioinput"
        selectedDeviceId=""
        devices={[
          { deviceId: "mic-1", kind: "audioinput", label: "Desk microphone" },
          { deviceId: "mic-2", kind: "audioinput", label: "USB microphone" },
        ]}
        onToggle={vi.fn()}
        onDeviceChange={onDeviceChange}
      />,
    );

    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Select Microphone"]');
    expect(trigger).not.toBeNull();
    act(() => trigger?.click());

    expect(container.querySelector('[role="listbox"][aria-label="Microphone device"]')).not.toBeNull();
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((candidate) => candidate.textContent?.includes("USB microphone"));
    expect(option).toBeDefined();
    act(() => option?.click());

    expect(onDeviceChange).toHaveBeenCalledWith("mic-2");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes an open dropdown on Escape and restores trigger focus", () => {
    const container = mount(
      <CallDeviceControl
        action="audio-output"
        label="Speaker"
        active
        deviceKind="audiooutput"
        selectedDeviceId="speaker-1"
        devices={[{ deviceId: "speaker-1", kind: "audiooutput", label: "Desk speakers" }]}
        onToggle={vi.fn()}
        onDeviceChange={vi.fn()}
      />,
    );
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Select Speaker"]');
    act(() => trigger?.click());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));

    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("disables device selection when the browser cannot apply the selected device", () => {
    const onDeviceChange = vi.fn();
    const container = mount(
      <CallDeviceControl
        action="audio-output"
        label="Speaker"
        active
        deviceKind="audiooutput"
        selectedDeviceId=""
        devices={[{ deviceId: "speaker-1", kind: "audiooutput", label: "Headphones" }]}
        canSelectDevice={false}
        onToggle={vi.fn()}
        onDeviceChange={onDeviceChange}
      />,
    );
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Select Speaker"]');

    expect(trigger?.disabled).toBe(true);
    act(() => trigger?.click());
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(onDeviceChange).not.toHaveBeenCalled();
  });
});

describe("CallDeviceControls", () => {
  it("maps microphone, speaker, and camera toggles to their respective setting patches", () => {
    const onPatch = vi.fn();
    const onToggleCamera = vi.fn();
    const container = mount(
      <CallDeviceControls
        settings={DEFAULT_CALL_SETTINGS}
        devices={[
          { deviceId: "mic-1", kind: "audioinput", label: "USB microphone" },
          { deviceId: "speaker-1", kind: "audiooutput", label: "Headphones" },
          { deviceId: "camera-1", kind: "videoinput", label: "External camera" },
        ]}
        controlClassName="call-control"
        onPatch={onPatch}
        onToggleCamera={onToggleCamera}
      />,
    );

    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Toggle Microphone"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Toggle Speaker"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Toggle Camera"]')?.click());

    expect(onPatch).toHaveBeenNthCalledWith(1, { micMuted: true });
    expect(onPatch).toHaveBeenNthCalledWith(2, { soundDisabled: true });
    expect(onToggleCamera).toHaveBeenCalledOnce();

    for (const [label, deviceName] of [
      ["Microphone", "USB microphone"],
      ["Speaker", "Headphones"],
      ["Camera", "External camera"],
    ]) {
      act(() => container.querySelector<HTMLButtonElement>(`[aria-label="Select ${label}"]`)?.click());
      const option = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'))
        .find((candidate) => candidate.textContent?.includes(deviceName));
      act(() => option?.click());
    }

    expect(onPatch).toHaveBeenNthCalledWith(3, { inputDeviceId: "mic-1" });
    expect(onPatch).toHaveBeenNthCalledWith(4, { outputDeviceId: "speaker-1" });
    expect(onPatch).toHaveBeenNthCalledWith(5, { videoDeviceId: "camera-1" });
  });

  it("hides only the camera control when requested", () => {
    const container = mount(
      <CallDeviceControls
        settings={DEFAULT_CALL_SETTINGS}
        controlClassName="call-control"
        showCamera={false}
        onPatch={vi.fn()}
        onToggleCamera={vi.fn()}
      />,
    );

    expect(container.querySelector('[aria-label="Toggle Microphone"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Toggle Speaker"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Toggle Camera"]')).toBeNull();
  });

  it("disables input and output menus when their capabilities are unavailable", () => {
    const container = mount(
      <CallDeviceControls
        settings={DEFAULT_CALL_SETTINGS}
        devices={[
          { deviceId: "mic-1", kind: "audioinput", label: "Microphone" },
          { deviceId: "speaker-1", kind: "audiooutput", label: "Speaker" },
        ]}
        controlClassName="call-control"
        capabilities={{
          canSelectInputDevice: false,
          canSelectOutputDevice: false,
          canUseNoiseSuppression: false,
          canUseEchoCancellation: false,
          canUseAutoGainControl: false,
          canUseVoiceEnhancement: false,
          canUseCamera: false,
          canShareScreen: false,
        } satisfies CallCapabilities}
        onPatch={vi.fn()}
        onToggleCamera={vi.fn()}
      />,
    );

    expect(container.querySelector<HTMLButtonElement>('[aria-label="Select Microphone"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Select Speaker"]')?.disabled).toBe(true);
  });

  it("uses localized device and toggle labels", () => {
    const container = mount(
      <CallDeviceControls
        settings={DEFAULT_CALL_SETTINGS}
        controlClassName="call-control"
        labels={{ microphone: "Микрофон", speaker: "Динамик", camera: "Камера" }}
        toggleLabels={{ microphone: "Выключить микрофон", camera: "Включить камеру" }}
        deviceStrings={{ selectDevice: "Выбрать", deviceLabelFormat: "Устройство: {label}", systemDefault: "По умолчанию", deviceSelectionUnavailable: "Выбор устройства недоступен" }}
        devices={[{ deviceId: "mic-ru", kind: "audioinput", label: "Микрофон USB" }]}
        onPatch={vi.fn()}
        onToggleCamera={vi.fn()}
      />,
    );

    expect(container.querySelector('[aria-label="Выключить микрофон"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Toggle Динамик"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Включить камеру"]')).not.toBeNull();
    const microphoneTrigger = container.querySelector<HTMLButtonElement>('[aria-label="Выбрать Микрофон"]');
    expect(microphoneTrigger).not.toBeNull();
    act(() => microphoneTrigger?.click());
    expect(container.querySelector('[role="listbox"][aria-label="Устройство: Микрофон"]')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('[role="option"]')).map((option) => option.textContent).join(" ")).toContain("По умолчанию");
    expect(microphoneTrigger?.title).toContain("По умолчанию");
  });
});
