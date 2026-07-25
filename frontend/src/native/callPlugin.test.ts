import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: true, name: "android" }));
const nativePlugin = vi.hoisted(() => ({
  enableCallMode: vi.fn(),
  disableCallMode: vi.fn(),
  setAudioRoute: vi.fn(),
  setActiveCallState: vi.fn(),
  setActiveVideoState: vi.fn(),
  isPictureInPictureSupported: vi.fn(),
  isPictureInPictureActive: vi.fn(),
  enterPictureInPictureIfPossible: vi.fn(),
  addListener: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
  },
  registerPlugin: () => nativePlugin,
}));

import {
  addPictureInPictureActionListener,
  enterNativePictureInPictureIfPossible,
  getNativePictureInPictureState,
  getNativePictureInPictureSupport,
  setNativeActiveVideoState,
  type NativeVideoPictureInPictureState,
  type PictureInPictureActionEvent,
  type PictureInPictureState,
} from "./callPlugin";

const video: NativeVideoPictureInPictureState = {
  active: true,
  playing: true,
  chatId: "chat/%/семья",
  messageId: "message/百分比%",
  fileId: "file/opaque%2Fid",
  positionSeconds: 12.5,
  durationSeconds: 40,
  width: 1280,
  height: 720,
  revision: 7,
};

const videoPiPState: PictureInPictureState = {
  active: true,
  supported: true,
  eligible: true,
  owner: "video",
  requestedOwner: "none",
  activeOwner: "video",
  callActive: false,
  video: false,
  chatId: null,
  sessionId: null,
  acceptedRevision: 7,
  videoState: video,
  reason: "entered",
};

describe("native call PiP bridge", () => {
  beforeEach(() => {
    platform.native = true;
    platform.name = "android";
    vi.clearAllMocks();
  });

  it("returns owner-none defaults off Android without invoking the plugin", async () => {
    platform.native = false;

    expect(await setNativeActiveVideoState(video)).toBeNull();
    expect(await getNativePictureInPictureState()).toMatchObject({
      active: false,
      supported: false,
      eligible: false,
      owner: "none",
      requestedOwner: "none",
      activeOwner: "none",
      callActive: false,
      video: false,
    });
    expect(await getNativePictureInPictureSupport()).toMatchObject({ owner: "none" });
    expect(await enterNativePictureInPictureIfPossible()).toBe(false);
    const cleanup = await addPictureInPictureActionListener(vi.fn());
    expect(() => cleanup()).not.toThrow();
    expect(nativePlugin.setActiveVideoState).not.toHaveBeenCalled();
    expect(nativePlugin.addListener).not.toHaveBeenCalled();
  });

  it("forwards exact opaque video metadata without URL or token fields", async () => {
    nativePlugin.setActiveVideoState.mockResolvedValue(videoPiPState);

    expect(await setNativeActiveVideoState(video)).toEqual(videoPiPState);
    expect(nativePlugin.setActiveVideoState).toHaveBeenCalledWith(video);
    expect(Object.keys(nativePlugin.setActiveVideoState.mock.calls[0][0]).sort()).toEqual(
      Object.keys(video).sort(),
    );

    if (false) {
      void setNativeActiveVideoState({
        ...video,
        // @ts-expect-error authenticated source URLs are not part of the native PiP contract
        sourceUrl: "blob:secret",
      });
    }
  });

  it("preserves call fields while discriminating video ownership and restore metadata", async () => {
    nativePlugin.isPictureInPictureActive.mockResolvedValue(videoPiPState);

    const state = await getNativePictureInPictureState();
    expect(state.owner).toBe("video");
    expect(state.callActive).toBe(false);
    expect(state.video).toBe(false);
    expect(state.videoState).toEqual(video);
    expect(state.videoState?.fileId).toBe("file/opaque%2Fid");
  });

  it("forwards only allowlisted actions and removes the listener idempotently", async () => {
    let nativeListener: ((event: PictureInPictureActionEvent) => void) | undefined;
    const remove = vi.fn().mockResolvedValue(undefined);
    nativePlugin.addListener.mockImplementation(
      async (_name: string, listener: (event: PictureInPictureActionEvent) => void) => {
        nativeListener = listener;
        return { remove };
      },
    );
    const onAction = vi.fn();

    const cleanup = await addPictureInPictureActionListener(onAction);
    nativeListener?.({ action: "pause", videoState: { ...video, playing: false } });
    nativeListener?.({ action: "delete-message", videoState: video } as unknown as PictureInPictureActionEvent);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      action: "pause",
      videoState: { ...video, playing: false },
    });

    cleanup();
    cleanup();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(nativePlugin.addListener).toHaveBeenCalledWith(
      "pictureInPictureAction",
      expect.any(Function),
    );
  });

  it("converts plugin rejection into safe lifecycle defaults", async () => {
    nativePlugin.setActiveVideoState.mockRejectedValue(new Error("unavailable"));
    nativePlugin.isPictureInPictureActive.mockRejectedValue(new Error("unavailable"));
    nativePlugin.isPictureInPictureSupported.mockRejectedValue(new Error("unavailable"));
    nativePlugin.enterPictureInPictureIfPossible.mockRejectedValue(new Error("unavailable"));
    nativePlugin.addListener.mockRejectedValue(new Error("unavailable"));

    expect(await setNativeActiveVideoState(video)).toBeNull();
    expect(await getNativePictureInPictureState()).toMatchObject({ owner: "none" });
    expect(await getNativePictureInPictureSupport()).toMatchObject({ owner: "none" });
    expect(await enterNativePictureInPictureIfPossible()).toBe(false);
    const cleanup = await addPictureInPictureActionListener(vi.fn());
    expect(() => cleanup()).not.toThrow();
  });

  it("forwards call-priority PiP snapshots and never exposes private media fields on the bridge", async () => {
    const callOwned: PictureInPictureState = {
      active: true,
      supported: true,
      eligible: true,
      owner: "call",
      requestedOwner: "call",
      activeOwner: "call",
      callActive: true,
      video: true,
      chatId: "call-chat",
      sessionId: "call-session",
      acceptedRevision: 9,
      videoState: { ...video, playing: false },
      reason: "call-priority",
    };
    const audioCallBlocked: PictureInPictureState = {
      ...callOwned,
      video: false,
      owner: "none",
      requestedOwner: "none",
      activeOwner: "none",
      eligible: false,
      reason: "audio-call",
    };
    nativePlugin.setActiveCallState.mockResolvedValueOnce(callOwned);
    nativePlugin.setActiveCallState.mockResolvedValueOnce(audioCallBlocked);
    nativePlugin.setActiveVideoState.mockResolvedValue({
      ...videoPiPState,
      callActive: false,
      owner: "video",
      videoState: { ...video, playing: false },
    });

    const { setNativeActiveCallState } = await import("./callPlugin");
    expect(await setNativeActiveCallState({
      active: true,
      video: true,
      chatId: "call-chat",
      sessionId: "call-session",
    })).toMatchObject({ owner: "call", callActive: true, video: true });
    expect(await setNativeActiveCallState({
      active: true,
      video: false,
      chatId: "call-chat",
      sessionId: "call-session",
    })).toMatchObject({ owner: "none", callActive: true, video: false, eligible: false });

    const pausedRestore = await setNativeActiveVideoState({ ...video, playing: false });
    expect(pausedRestore?.videoState?.playing).toBe(false);
    expect(JSON.stringify(pausedRestore)).not.toMatch(/token|sourceUrl|Authorization|blob:/i);
    expect(JSON.stringify(nativePlugin.setActiveCallState.mock.calls)).not.toMatch(
      /token|sourceUrl|Authorization|blob:/i,
    );
  });

  it("ignores incomplete, non-finite, and unknown action payloads without invoking the listener", async () => {
    let nativeListener: ((event: PictureInPictureActionEvent) => void) | undefined;
    nativePlugin.addListener.mockImplementation(
      async (_name: string, listener: (event: PictureInPictureActionEvent) => void) => {
        nativeListener = listener;
        return { remove: vi.fn().mockResolvedValue(undefined) };
      },
    );
    const onAction = vi.fn();
    await addPictureInPictureActionListener(onAction);

    nativeListener?.({ action: "play", videoState: video });
    nativeListener?.({ action: "seek-to-end" as PictureInPictureActionEvent["action"], videoState: video });
    nativeListener?.({
      action: "pause",
      videoState: {
        ...video,
        positionSeconds: Number.NaN,
        durationSeconds: Number.POSITIVE_INFINITY,
      },
    });
    nativeListener?.(undefined as unknown as PictureInPictureActionEvent);

    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenNthCalledWith(1, { action: "play", videoState: video });
    expect(onAction.mock.calls[1][0].action).toBe("pause");
  });
});
