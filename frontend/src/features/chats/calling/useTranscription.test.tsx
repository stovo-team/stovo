import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTranscription } from "./useTranscription";

const mountedRoots: Root[] = [];

class FakeMediaStream {
  constructor(private readonly tracks: MediaStreamTrack[] = []) {}

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getTracks() {
    return this.tracks;
  }
}

class FakeMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  state: RecordingState = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;

  constructor(readonly stream: MediaStream) {}

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
  }
}

function TranscriptionProbe({ localAudioStream }: { localAudioStream: MediaStream }) {
  const { startTranscription } = useTranscription({
    accessToken: "test-token",
    roomId: "voice-room-1",
    currentUserId: "user-1",
    localAudioStream,
  });

  return <button type="button" onClick={() => void startTranscription()}>Start notes</button>;
}

afterEach(() => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    act(() => root?.unmount());
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useTranscription", () => {
  it("records the active audio-call stream instead of requesting a second microphone", async () => {
    const audioTrack = { kind: "audio", readyState: "live" } as MediaStreamTrack;
    const callStream = new FakeMediaStream([audioTrack]) as unknown as MediaStream;
    const recorderConstructor = vi.fn(function (this: FakeMediaRecorder, stream: MediaStream) {
      return new FakeMediaRecorder(stream);
    });
    Object.assign(recorderConstructor, { isTypeSupported: FakeMediaRecorder.isTypeSupported });

    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("MediaRecorder", recorderConstructor);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: "transcript-1", status: "recording" }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    )));

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    act(() => root.render(<TranscriptionProbe localAudioStream={callStream} />));

    await act(async () => {
      (container.querySelector("button") as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(recorderConstructor).toHaveBeenCalledWith(expect.objectContaining({ getAudioTracks: expect.any(Function) }), expect.anything());
  });
});
