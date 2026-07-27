import { describe, expect, it, vi } from "vitest";

import { isVoiceRecordingSupported, startVoiceRecording } from "./voiceRecording";

describe("voiceRecording", () => {
  it("reports unsupported when MediaRecorder is missing", () => {
    const original = globalThis.MediaRecorder;
    // @ts-expect-error intentional delete for capability probe
    delete globalThis.MediaRecorder;
    expect(isVoiceRecordingSupported()).toBe(false);
    globalThis.MediaRecorder = original;
  });

  it("starts a recorder and returns a file on stop", async () => {
    const trackStop = vi.fn();
    const stream = {
      getTracks: () => [{ stop: trackStop }]
    } as unknown as MediaStream;

    const listeners = new Map<string, Set<EventListener>>();
    const recorder = {
      mimeType: "audio/webm",
      state: "recording",
      addEventListener: (type: string, listener: EventListener) => {
        const set = listeners.get(type) ?? new Set<EventListener>();
        set.add(listener);
        listeners.set(type, set);
      },
      start: vi.fn(),
      stop: vi.fn(() => {
        recorder.state = "inactive";
        const blob = new Blob(["voice"], { type: "audio/webm" });
        for (const listener of listeners.get("dataavailable") ?? []) {
          listener({ data: blob } as BlobEvent);
        }
        for (const listener of listeners.get("stop") ?? []) {
          listener(new Event("stop"));
        }
      })
    };

    vi.stubGlobal(
      "MediaRecorder",
      Object.assign(
        vi.fn(function MediaRecorder() {
          return recorder;
        }),
        { isTypeSupported: () => true },
      ) as unknown as typeof MediaRecorder,
    );

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => stream)
      }
    });

    const handle = await startVoiceRecording();
    expect(recorder.start).toHaveBeenCalled();
    const file = await handle.stop();
    expect(file.name).toMatch(/^voice-.*\.webm$/);
    expect(file.type).toContain("audio/");
    expect(trackStop).toHaveBeenCalled();
  });
});
