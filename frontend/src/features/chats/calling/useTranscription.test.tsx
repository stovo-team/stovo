import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTranscription } from "./useTranscription";

vi.mock("../../../api/client", () => ({
  getApiUrl: () => "https://api.example.test",
}));

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
  onstop: (() => void) | null = null;

  constructor(readonly stream: MediaStream) {}

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["final audio"]) } as BlobEvent);
    this.onstop?.();
  }
}

class FakeAudioContext {
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }

  createAnalyser() {
    return {
      fftSize: 512,
      getFloatTimeDomainData(samples: Float32Array) {
        samples.fill(0.02);
      },
    };
  }

  close() {
    return Promise.resolve();
  }
}

function TranscriptionProbe({ localAudioStream }: { localAudioStream: MediaStream }) {
  const { startTranscription, stopTranscription } = useTranscription({
    accessToken: "test-token",
    roomId: "voice-room-1",
    currentUserId: "user-1",
    localAudioStream,
  });

  return <>
    <button type="button" onClick={() => void startTranscription()}>Start notes</button>
    <button type="button" onClick={() => void stopTranscription()}>Stop notes</button>
  </>;
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
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: "transcript-1", status: "recording" }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    act(() => root.render(<TranscriptionProbe localAudioStream={callStream} />));

    await act(async () => {
      (container.querySelector("button") as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(recorderConstructor).toHaveBeenCalledWith(expect.objectContaining({ getAudioTracks: expect.any(Function) }), expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/calls/voice-room-1/transcription/start",
      expect.any(Object),
    );
  });

  it("uploads MediaRecorder's terminal chunk before requesting processing", async () => {
    const audioTrack = { kind: "audio", readyState: "live" } as MediaStreamTrack;
    const callStream = new FakeMediaStream([audioTrack]) as unknown as MediaStream;
    const recorderConstructor = vi.fn(function (this: FakeMediaRecorder, stream: MediaStream) {
      return new FakeMediaRecorder(stream);
    });
    Object.assign(recorderConstructor, { isTypeSupported: FakeMediaRecorder.isTypeSupported });
    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("MediaRecorder", recorderConstructor);
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/transcription/start")) {
        return new Response(JSON.stringify({ id: "transcript-1", status: "recording" }), { status: 201 });
      }
      if (url.endsWith("/transcription/uploads")) {
        return new Response(JSON.stringify({ chunkId: "chunk-1", uploadUrl: "/chunk-data" }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    act(() => root.render(<TranscriptionProbe localAudioStream={callStream} />));

    await act(async () => {
      (container.querySelectorAll("button")[0] as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // React starts the recorder in the effect after the start request resolves.
    // Give VAD several samples so this test exercises a valid voice chunk.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await act(async () => {
      (container.querySelectorAll("button")[1] as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const requestedUrls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(requestedUrls).toEqual(expect.arrayContaining([
      "https://api.example.test/api/calls/voice-room-1/transcription/uploads",
      "https://api.example.test/chunk-data",
      "https://api.example.test/api/calls/voice-room-1/transcription/uploads/chunk-1/complete",
      "https://api.example.test/api/calls/voice-room-1/transcription/stop",
    ]));
    expect(requestedUrls.indexOf("https://api.example.test/api/calls/voice-room-1/transcription/uploads/chunk-1/complete"))
      .toBeLessThan(requestedUrls.indexOf("https://api.example.test/api/calls/voice-room-1/transcription/stop"));
  });
});
