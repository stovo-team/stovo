import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Volume2, VolumeX } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { CallControlButton } from "./CallControlButton";

const roots: Root[] = [];

afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
});

function renderControl(props: React.ComponentProps<typeof CallControlButton>) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<CallControlButton {...props} />));
  return host;
}

describe("shared call control button", () => {
  it("uses the same microphone icon component across DM/group, mobile, voice and guest surfaces", () => {
    const desktop = renderControl({ action: "microphone", label: "Mute", state: "active", onClick: vi.fn() });
    const mobile = renderControl({ action: "microphone", label: "Mute", state: "active", onClick: vi.fn() });

    expect(desktop.querySelector("button")?.getAttribute("aria-label")).toBe("Mute");
    expect(mobile.querySelector("button")?.getAttribute("aria-label")).toBe("Mute");
    expect(desktop.querySelector("button")?.querySelector("svg")?.outerHTML).toBe(
      mobile.querySelector("button")?.querySelector("svg")?.outerHTML,
    );
    expect(desktop.querySelector("button")?.classList.contains("shared-call-control-button")).toBe(true);

    const surfaceFiles = [
      "src/features/chats/calling/DesktopCallControls.tsx",
      "src/features/chats/calling/MobileActiveScreen.tsx",
      "src/features/chats/calling/VoiceChannelStage.tsx",
      "src/pages/GuestMeetingPage.tsx",
    ];
    for (const file of surfaceFiles) {
      expect(readFileSync(resolve(process.cwd(), file), "utf8")).toContain("CallControlButton");
    }
  });

  it("reflects active and muted microphone states with distinct icons and action behavior", () => {
    const onClick = vi.fn();
    const activeHost = renderControl({ action: "microphone", label: "Mute", state: "active", onClick });
    const host = renderControl({ action: "microphone", label: "Unmute", state: "muted", onClick });
    const activeButton = activeHost.querySelector<HTMLButtonElement>("button");
    const button = host.querySelector<HTMLButtonElement>("button");

    expect(activeButton?.getAttribute("aria-pressed")).toBe("true");
    expect(activeButton?.classList.contains("is-active")).toBe(true);
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    expect(button?.classList.contains("is-muted")).toBe(true);
    expect(activeButton?.querySelector("svg")?.outerHTML).not.toBe(button?.querySelector("svg")?.outerHTML);
    act(() => button?.click());
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps disabled microphone and speaker controls neutral while the speaker icon reflects its state", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const micMuted = renderControl({ action: "microphone", label: "Unmute", state: "muted", onClick: vi.fn() });
    const speakerOn = renderControl({ action: "audio-output", label: "Mute speaker", state: "active", onClick: vi.fn(), toggle: true });
    const speakerOff = renderControl({ action: "audio-output", label: "Unmute speaker", state: "muted", onClick: vi.fn(), toggle: true });
    const mutedMicButton = micMuted.querySelector("button")!;
    const speakerOnButton = speakerOn.querySelector("button")!;
    const speakerOffButton = speakerOff.querySelector("button")!;
    const mutedRules = css.match(/\.shared-call-controls\s+\.call-ctrl-btn\.is-muted,[\s\S]*?\{([^}]*)\}/)?.[1] ?? "";
    const activeRules = css.match(/\.shared-call-controls\s+\.call-ctrl-btn\.is-active,[\s\S]*?\{([^}]*)\}/)?.[1] ?? "";
    const mutedColor = mutedRules.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]?.trim();
    const activeColor = activeRules.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]?.trim();

    expect(mutedMicButton.classList.contains("is-muted")).toBe(true);
    expect(mutedRules).toMatch(/background(?:-color)?\s*:/i);
    expect(mutedRules).not.toMatch(/(?:220\s*,\s*38\s*,\s*38|#dc2626|#f87171|#ff0000)/i);
    expect(speakerOnButton.getAttribute("aria-pressed")).toBe("true");
    expect(speakerOffButton.getAttribute("aria-pressed")).toBe("false");
    expect(speakerOnButton.querySelector("svg")?.outerHTML).toBe(renderToStaticMarkup(<Volume2 aria-hidden="true" size={20} />));
    expect(speakerOffButton.querySelector("svg")?.outerHTML).toBe(renderToStaticMarkup(<VolumeX aria-hidden="true" size={20} />));
    expect(speakerOnButton.classList.contains("is-active")).toBe(true);
    expect(speakerOffButton.classList.contains("is-muted")).toBe(true);
    expect(activeColor).toBeTruthy();
    expect(mutedColor).toBeTruthy();
    expect(mutedColor).not.toBe(activeColor);
  });

  it("switches camera and screen-share icons with their states", () => {
    const cameraOn = renderControl({ action: "camera", label: "Turn off camera", state: "active", onClick: vi.fn() });
    const cameraOff = renderControl({ action: "camera", label: "Turn on camera", state: "muted", onClick: vi.fn() });
    const sharing = renderControl({ action: "screen-share", label: "Stop sharing", state: "active", onClick: vi.fn() });
    const notSharing = renderControl({ action: "screen-share", label: "Share screen", state: "idle", onClick: vi.fn() });

    expect(cameraOn.querySelector("svg")?.outerHTML).not.toBe(cameraOff.querySelector("svg")?.outerHTML);
    expect(sharing.querySelector("svg")?.outerHTML).not.toBe(notSharing.querySelector("svg")?.outerHTML);
  });

  it("does not expose toggle state for one-shot actions", () => {
    const endCall = renderControl({ action: "end-call", label: "End call", state: "idle", onClick: vi.fn() });
    const flipCamera = renderControl({ action: "flip-camera", label: "Flip camera", state: "idle", onClick: vi.fn() });
    const audioOutput = renderControl({ action: "audio-output", label: "Audio output", state: "idle", onClick: vi.fn() });

    for (const host of [endCall, flipCamera, audioOutput]) {
      expect(host.querySelector("button")?.hasAttribute("aria-pressed")).toBe(false);
    }
  });
});
