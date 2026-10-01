import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLiveCaptions } from "./useLiveCaptions";

vi.mock("../../../api/client", () => ({
  getApiUrl: () => "https://api.example.test",
}));

class FakeSpeechRecognition extends EventTarget {
  static instance: FakeSpeechRecognition;
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    super();
    FakeSpeechRecognition.instance = this;
  }
}

const roots: Root[] = [];

function CaptionProbe({ localAudioStream }: { localAudioStream?: MediaStream | null }) {
  const captions = useLiveCaptions({ roomId: "room-1", localAudioStream });
  return <><button type="button" onClick={captions.toggleCaptions}>Toggle captions</button><output>{captions.recentCaptions.map((item) => item.originalText).join(" ")}</output></>;
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    act(() => root?.unmount());
  }
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useLiveCaptions", () => {
  it("submits captured local microphone audio for source-language captions", async () => {
    Object.defineProperty(navigator, "language", { configurable: true, value: "en-US" });
    const stream = { getAudioTracks: () => [{ readyState: "live", stop: vi.fn() }] } as unknown as MediaStream;
    vi.stubGlobal("MediaStream", class { constructor() { return stream; } });
    const recorder = new FakeMediaRecorder(stream);
    vi.stubGlobal("MediaRecorder", class {
      constructor(input: MediaStream) { return recorder as unknown as MediaRecorder; }
      static isTypeSupported() { return true; }
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ text: "Привет", sourceLang: "ru" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<CaptionProbe localAudioStream={stream} />));
    act(() => (container.querySelector("button") as HTMLButtonElement).click());
    expect(recorder.stream).toBe(stream);
    expect(recorder.start).toHaveBeenCalled();
    act(() => recorder.stop());
    expect(recorder.start).toHaveBeenCalledTimes(2);
    await act(async () => {
      recorder.emitChunk(new Blob(["russian audio"], { type: "audio/webm" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.example.test/api/calls/room-1/captions/transcribe");
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("targetLang")).toBeNull();
    expect((request.body as FormData).get("audio")).toBeInstanceOf(Blob);
    expect(container.textContent).toContain("Привет");
  });

  it("ignores empty recorder chunks and stops capture when captions are disabled", async () => {
    const stream = { getAudioTracks: () => [{ readyState: "live", stop: vi.fn() }] } as unknown as MediaStream;
    vi.stubGlobal("MediaStream", class { constructor() { return stream; } });
    const recorder = new FakeMediaRecorder(stream);
    vi.stubGlobal("MediaRecorder", class {
      constructor() { return recorder as unknown as MediaRecorder; }
      static isTypeSupported() { return true; }
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<CaptionProbe localAudioStream={stream} />));
    const toggle = container.querySelector("button") as HTMLButtonElement;
    act(() => toggle.click());
    await act(async () => {
      recorder.emitChunk(new Blob([], { type: "audio/webm" }));
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      toggle.click();
      await Promise.resolve();
    });
    expect(recorder.stop).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const finalRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((finalRequest.body as FormData).get("audio")).toBeInstanceOf(Blob);
  });
});

class FakeMediaRecorder extends EventTarget {
  static latest: FakeMediaRecorder;
  start = vi.fn(() => { this.state = "recording"; });
  stop = vi.fn(() => {
    this.state = "inactive";
    this.emitChunk(new Blob(["final standalone audio"], { type: "audio/webm" }));
    const event = new Event("stop");
    this.onstop?.(event);
    this.dispatchEvent(event);
  });
  state: RecordingState = "inactive";
  readonly stream: MediaStream;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;

  constructor(stream: MediaStream) {
    super();
    this.stream = stream;
    FakeMediaRecorder.latest = this;
  }

  emitChunk(data: Blob) {
    const event = new Event("dataavailable") as BlobEvent;
    Object.defineProperty(event, "data", { value: data });
    this.ondataavailable?.(event);
    this.dispatchEvent(event);
  }
}
