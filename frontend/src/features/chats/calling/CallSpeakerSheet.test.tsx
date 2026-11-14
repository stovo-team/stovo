import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CallSpeakerSheet } from "./CallSpeakerSheet";

const roots: Root[] = [];
afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
});

describe("CallSpeakerSheet Android routing", () => {
  it("offers built-in earpiece and loudspeaker controls instead of WebView output ids", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host); roots.push(root);
    const onSelect = vi.fn();
    act(() => root.render(<CallSpeakerSheet
      isAndroid
      devices={[{ deviceId: "default", kind: "audiooutput", label: "Default" }, { deviceId: "bt-headset", kind: "audiooutput", label: "Bluetooth headset" }]}
      currentOutputDeviceId="default"
      speakerMode="small"
      onSelect={onSelect}
      onClose={() => undefined}
    />));
    const buttons = host.querySelectorAll<HTMLButtonElement>(".call-speaker-sheet-item");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
    act(() => buttons[1].click());
    expect(onSelect).toHaveBeenCalledWith(null, "large");
  });
});
