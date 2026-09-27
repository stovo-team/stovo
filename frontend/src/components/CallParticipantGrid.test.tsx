import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import CallParticipantGrid from "./CallParticipantGrid";

const roots: Root[] = [];

afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
});

function renderGrid(props: ComponentProps<typeof CallParticipantGrid>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<CallParticipantGrid {...props} />));
  return container;
}

function stream(videoTrack?: { readyState: string; enabled: boolean; kind: string }) {
  const tracks = videoTrack ? [videoTrack] : [];
  return {
    getVideoTracks: () => tracks,
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

const baseProps = {
  localStream: null,
  remoteMedia: [],
  callType: "video" as const,
};

describe("CallParticipantGrid screen-share participants", () => {
  it("shows local and remote participants as square avatar tiles beside the shared screen", () => {
    const container = renderGrid({
      ...baseProps,
      localUserLabel: "You",
      localScreenStream: stream({ readyState: "live", enabled: true, kind: "video" }),
      remoteMedia: [{
        userId: "alice",
        stream: stream(),
        hasVideo: false,
        hasAudio: true,
        hasScreenShare: false,
      }],
    });

    const participants = Array.from(container.querySelectorAll(".call-grid__tile--local, .call-grid__tile--remote")) as HTMLDivElement[];
    expect(participants).toHaveLength(2);
    expect(participants.map((tile) => tile.style.aspectRatio)).toEqual(["1 / 1", "1 / 1"]);
    expect(container.querySelector(".call-grid__tile--screen")).not.toBeNull();
    expect(container.querySelector(".call-grid__tile--local .call-grid__avatar")).not.toBeNull();
    expect(container.querySelector(".call-grid__tile--remote .call-grid__avatar")).not.toBeNull();
  });

  it("uses each participant camera video inside their square tile when available", () => {
    const camera = stream({ readyState: "live", enabled: true, kind: "video" });
    const container = renderGrid({
      ...baseProps,
      localStream: camera,
      localScreenStream: stream({ readyState: "live", enabled: true, kind: "video" }),
      remoteMedia: [{
        userId: "alice",
        stream: camera,
        hasVideo: true,
        hasAudio: true,
        hasScreenShare: false,
      }],
    });

    const participants = Array.from(container.querySelectorAll(".call-grid__tile--local, .call-grid__tile--remote")) as HTMLDivElement[];
    expect(participants.every((tile) => tile.style.aspectRatio === "1 / 1")).toBe(true);
    expect(container.querySelectorAll(".call-grid__tile--local video, .call-grid__tile--remote video")).toHaveLength(2);
  });
});
