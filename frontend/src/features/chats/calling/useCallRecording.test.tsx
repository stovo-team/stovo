import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";

import { useCallRecording } from "./useCallRecording";

vi.mock("../../../api/client", () => ({ getApiUrl: () => "https://api.example.test" }));

const roots: Root[] = [];
let decodedWidth = 0;
let decodedHeight = 0;
let pendingAnimationFrame: FrameRequestCallback | null = null;
let originalCaptureStreamDescriptor: PropertyDescriptor | undefined;
const recorderInstances: FakeMediaRecorder[] = [];

class FakeMediaStream {
  constructor(private readonly tracks: MediaStreamTrack[] = []) {}
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === "video"); }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
}

class FakeMediaRecorder {
  static isTypeSupported() { return true; }
  state: MediaRecorderState = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly stream: MediaStream) { recorderInstances.push(this); }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recorded video"], { type: "video/webm" }) } as BlobEvent);
    this.onstop?.();
  }
}

type RecordingSocketEvent = { roomId: string; recordingId: string; message: string };
type FakeSocket = {
  on: (event: string, handler: (payload: RecordingSocketEvent) => void) => void;
  off: (event: string, handler: (payload: RecordingSocketEvent) => void) => void;
  listeners: Map<string, (payload: RecordingSocketEvent) => void>;
};

function RecordingProbe({ videoStream, socketRef }: { videoStream: MediaStream; socketRef?: RefObject<Socket | null> }) {
  const recording = useCallRecording({ accessToken: "token", roomId: "room-1", localStream: videoStream, socketRef });
  return <>
    <output data-testid="state">{recording.recordingState}</output>
    <output data-testid="recording-id">{recording.recordingId ?? ""}</output>
    <button onClick={() => void recording.startRecording()}>Start</button>
    <button onClick={() => void recording.stopRecording()}>Stop</button>
  </>;
}

function setup(socketRef?: RefObject<Socket | null>) {
  const videoTrack = { id: "camera-1", kind: "video", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<RecordingProbe videoStream={new FakeMediaStream([videoTrack]) as unknown as MediaStream} socketRef={socketRef} />));
  return container;
}

async function start(container: HTMLElement) {
  await act(async () => {
    (container.querySelectorAll("button")[0] as HTMLButtonElement).click();
    await Promise.resolve();
  });
}

async function stop(container: HTMLElement) {
  await act(async () => {
    (container.querySelectorAll("button")[1] as HTMLButtonElement).click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  originalCaptureStreamDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "captureStream");
  decodedWidth = 0;
  decodedHeight = 0;
  pendingAnimationFrame = null;
  recorderInstances.length = 0;
  vi.stubGlobal("MediaStream", FakeMediaStream);
  const recorderCtor = FakeMediaRecorder as unknown as typeof MediaRecorder;
  vi.stubGlobal("MediaRecorder", recorderCtor);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    pendingAnimationFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLVideoElement.prototype, "play").mockResolvedValue(undefined);
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => decodedWidth });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => decodedHeight });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillStyle: "", font: "", textAlign: "center", fillRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
    configurable: true,
    value: vi.fn(() => new FakeMediaStream([
      { kind: "video", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack,
    ]) as unknown as MediaStream),
  });
});

afterEach(() => {
  while (roots.length) act(() => roots.pop()?.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalCaptureStreamDescriptor) {
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", originalCaptureStreamDescriptor);
  } else {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, "captureStream");
  }
});

describe("useCallRecording video validation", () => {
  it("enters failed state for a failed event from this room and ignores another room", () => {
    const listeners = new Map<string, (payload: RecordingSocketEvent) => void>();
    const socket: FakeSocket = {
      listeners,
      on: (event, handler) => { listeners.set(event, handler); },
      off: (event, handler) => { if (listeners.get(event) === handler) listeners.delete(event); },
    };
    const socketRef = { current: socket as unknown as Socket } as RefObject<Socket | null>;
    const container = setup(socketRef);
    const onFailed = listeners.get("call.recording.failed");
    const onStarted = listeners.get("call.recording.started");
    const onStopping = listeners.get("call.recording.stopping");
    const onReady = listeners.get("call.recording.ready");
    expect(onFailed).toBeDefined();
    expect(onStarted).toBeDefined();
    expect(onStopping).toBeDefined();
    expect(onReady).toBeDefined();

    act(() => onFailed?.({ roomId: "other-room", recordingId: "recording-1", message: "capture failed" }));
    expect(container.querySelector("[data-testid=state]")?.textContent).toBe("idle");

    act(() => onStarted?.({ roomId: "room-1", recordingId: "recording-2", message: "" }));
    expect(container.querySelector("[data-testid=state]")?.textContent).toBe("recording");
    expect(container.querySelector("[data-testid=recording-id]")?.textContent).toBe("recording-2");

    act(() => onFailed?.({ roomId: "room-1", recordingId: "recording-1", message: "stale capture failure" }));
    expect(container.querySelector("[data-testid=state]")?.textContent).toBe("recording");
    expect(container.querySelector("[data-testid=recording-id]")?.textContent).toBe("recording-2");

    act(() => onStopping?.({ roomId: "room-1", recordingId: "recording-1", message: "" }));
    expect(container.querySelector("[data-testid=state]")?.textContent).toBe("recording");
    act(() => onReady?.({ roomId: "room-1", recordingId: "recording-1", message: "" }));
    expect(container.querySelector("[data-testid=state]")?.textContent).toBe("recording");
    expect(container.querySelector("[data-testid=recording-id]")?.textContent).toBe("recording-2");

    act(() => onStopping?.({ roomId: "room-1", recordingId: "recording-2", message: "" }));
    expect(container.querySelector("[data-testid=state]")?.textContent).toBe("stopping");
    expect(container.querySelector("[data-testid=recording-id]")?.textContent).toBe("recording-2");
    act(() => onReady?.({ roomId: "room-1", recordingId: "recording-2", message: "" }));
    expect(container.querySelector("[data-testid=state]")?.textContent).toBe("completed");
    expect(container.querySelector("[data-testid=recording-id]")?.textContent).toBe("recording-2");

    act(() => onFailed?.({ roomId: "room-1", recordingId: "recording-2", message: "capture failed" }));
    expect(container.querySelector("[data-testid=state]")?.textContent).toBe("failed");
    expect(container.querySelector("[data-testid=recording-id]")?.textContent).toBe("recording-2");
  });

  it("fails a placeholder-only recording without uploading or creating a chat video artifact", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ id: "recording-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const container = setup();

    await start(container);
    await stop(container);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test/api/calls/room-1/recording/start",
      "https://api.example.test/api/calls/room-1/recording/stop",
      "https://api.example.test/api/calls/room-1/recording/fail",
    ]);
    const failureCall = fetchMock.mock.calls[2];
    expect(failureCall[1]?.body).toEqual(expect.any(String));
    expect(JSON.parse(failureCall[1]?.body as string)).toEqual(expect.objectContaining({
      recordingId: "recording-1",
      message: expect.any(String),
    }));
    expect(container.querySelector("[data-testid=state]")?.textContent).toBe("failed");
  });

  it("completes when camera frames arrive after recording starts", async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith("/recording/start")
      ? new Response(JSON.stringify({ id: "recording-1" }), { status: 200 })
      : new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const container = setup();

    await start(container);
    decodedWidth = 640;
    decodedHeight = 360;
    await act(async () => {
      const nextFrame = pendingAnimationFrame;
      pendingAnimationFrame = null;
      nextFrame?.(16);
      await Promise.resolve();
    });
    await stop(container);

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain("https://api.example.test/api/calls/room-1/recording/upload");
    expect(container.querySelector("[data-testid=state]")?.textContent).toBe("completed");
  });

  it("fails when the upload endpoint returns a non-success response", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/recording/start")) return new Response(JSON.stringify({ id: "recording-1" }), { status: 200 });
      return new Response("storage unavailable", { status: 502 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const container = setup();
    await start(container);
    decodedWidth = 640;
    decodedHeight = 360;
    await act(async () => {
      const nextFrame = pendingAnimationFrame;
      pendingAnimationFrame = null;
      nextFrame?.(16);
      await Promise.resolve();
    });
    await stop(container);

    const uploadCall = fetchMock.mock.calls.find(([url]) => url.endsWith("/recording/upload"));
    expect(uploadCall).toBeDefined();
    const uploadBody = uploadCall?.[1]?.body as FormData;
    const uploadedFile = uploadBody.get("file") as File;
    expect(uploadedFile).toBeInstanceOf(Blob);
    expect(uploadedFile.size).toBeGreaterThan(0);
    expect(container.querySelector("[data-testid=state]")?.textContent).toBe("failed");
  });
});
