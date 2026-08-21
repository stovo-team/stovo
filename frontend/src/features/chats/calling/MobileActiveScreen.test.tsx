import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MobileActiveScreen } from "./MobileActiveScreen";

function renderComponent(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return container;
}

describe("MobileActiveScreen", () => {
  const defaultProps = {
    peerName: "Alice",
    peerProfilePhoto: null,
    accessToken: "test-token",
    callType: "audio" as const,
    callPhase: "in-call",
    isPeerSpeaking: false,
    isProximityNear: false,
    isMicMuted: false,
    isCameraEnabled: false,
    isScreenSharing: false,
    cameraFacingMode: "user" as const,
    speakerMode: "large" as const,
    timer: "00:45",
    hasRemoteVideo: false,
    localVideoStream: null,
    remoteVideoStream: null,
    mirrorLocalVideo: false,
    onToggleMic: vi.fn(),
    onToggleCamera: vi.fn(),
    onToggleScreenShare: vi.fn(),
    onToggleFlip: vi.fn(),
    onOpenSpeakerSheet: vi.fn(),
    onEnd: vi.fn(),
  };

  it("renders screen share button when canShareScreen is true", () => {
    const container = renderComponent(
      <MobileActiveScreen {...defaultProps} canShareScreen={true} />
    );

    const shareBtn = container.querySelector("button[aria-label='Share screen']");
    expect(shareBtn).toBeDefined();
    expect(shareBtn).not.toBeNull();
  });

  it("hides screen share button when canShareScreen is false (e.g. Android WebView)", () => {
    const container = renderComponent(
      <MobileActiveScreen {...defaultProps} canShareScreen={false} />
    );

    const shareBtn = container.querySelector("button[aria-label='Share screen']");
    expect(shareBtn).toBeNull();
  });

  it("hides screen share button when canShareScreen is undefined", () => {
    const container = renderComponent(
      <MobileActiveScreen {...defaultProps} canShareScreen={undefined} />
    );

    const shareBtn = container.querySelector("button[aria-label='Share screen']");
    expect(shareBtn).toBeNull();
  });
});
