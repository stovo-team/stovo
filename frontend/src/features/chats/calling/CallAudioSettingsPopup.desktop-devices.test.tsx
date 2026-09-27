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
  it("keeps input and output dropdowns and applies the selected devices", () => {
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

    const selects = container.querySelectorAll("select");
    expect(selects).toHaveLength(2);
    expect(Array.from(selects[0].options).map((option) => option.textContent)).toContain("Desk microphone");
    expect(Array.from(selects[1].options).map((option) => option.textContent)).toContain("Desk speakers");

    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    act(() => {
      valueSetter?.call(selects[0], "mic-1");
      selects[0].dispatchEvent(new Event("change", { bubbles: true }));
      valueSetter?.call(selects[1], "speaker-1");
      selects[1].dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenNthCalledWith(1, { inputDeviceId: "mic-1" });
    expect(onPatch).toHaveBeenNthCalledWith(2, { outputDeviceId: "speaker-1" });
  });
});
