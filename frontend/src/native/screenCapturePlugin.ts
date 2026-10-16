import { Capacitor, registerPlugin } from "@capacitor/core";
import { DESIGN_COLOR_VALUES } from "../design-system/palette";

export type ScreenFrameEvent = {
  data: string; // base64 JPEG
  width: number;
  height: number;
};

export type ScreenCaptureStartResult = {
  active?: boolean;
  alreadyActive?: boolean;
  width?: number;
  height?: number;
};

export type ScreenCapturePluginResult = {
  active: boolean;
};

export type ScreenCapturePluginSupportedResult = {
  supported: boolean;
};

export interface ScreenCapturePluginNative {
  isSupported(): Promise<ScreenCapturePluginSupportedResult>;
  start(): Promise<ScreenCaptureStartResult>;
  stop(): Promise<ScreenCapturePluginResult>;
  addListener(
    eventName: "screenFrame",
    listener: (event: ScreenFrameEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "stopped",
    listener: () => void
  ): Promise<{ remove: () => Promise<void> }>;
}

export const ScreenCapturePlugin = registerPlugin<ScreenCapturePluginNative>("ScreenCapturePlugin");

export function isNativeScreenCaptureAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function checkNativeScreenCaptureSupported(): Promise<boolean> {
  if (!isNativeScreenCaptureAvailable()) return false;
  try {
    const result = await ScreenCapturePlugin.isSupported();
    return Boolean(result.supported);
  } catch {
    return false;
  }
}

/**
 * Initiates native Android screen capture and creates a MediaStream from a canvas
 * capturing native display frames.
 */
export async function createNativeScreenCaptureStream(): Promise<MediaStream> {
  if (!isNativeScreenCaptureAvailable()) {
    throw new Error("Native screen capture is only supported on Android");
  }

  const startRes = await ScreenCapturePlugin.start();
  const width = startRes.width || 720;
  const height = startRes.height || 1280;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });

  if (!ctx) {
    await ScreenCapturePlugin.stop().catch(() => undefined);
    throw new Error("Could not create 2D canvas context for screen capture");
  }

  // Draw initial black frame
  ctx.fillStyle = DESIGN_COLOR_VALUES.native.screenCaptureBackground;
  ctx.fillRect(0, 0, width, height);

  let isCapturing = true;
  let activeFrameImg: HTMLImageElement | null = null;

  const frameListenerHandle = await ScreenCapturePlugin.addListener("screenFrame", (event) => {
    if (!isCapturing || !event?.data) return;

    const img = new Image();
    img.onload = () => {
      if (!isCapturing) return;
      if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      ctx.drawImage(img, 0, 0);
      activeFrameImg = null;
    };
    img.onerror = () => {
      activeFrameImg = null;
    };
    activeFrameImg = img;
    img.src = `data:image/jpeg;base64,${event.data}`;
  });

  const stoppedListenerHandle = await ScreenCapturePlugin.addListener("stopped", () => {
    cleanup();
  });

  let stream: MediaStream;
  if (typeof (canvas as unknown as { captureStream?: (fps?: number) => MediaStream }).captureStream === "function") {
    stream = canvas.captureStream(15);
  } else {
    cleanup();
    throw new Error("captureStream is not supported on this canvas");
  }

  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    cleanup();
    throw new Error("No video track generated from captured screen");
  }

  function cleanup() {
    if (!isCapturing) return;
    isCapturing = false;
    activeFrameImg = null;
    void frameListenerHandle.remove().catch(() => undefined);
    void stoppedListenerHandle.remove().catch(() => undefined);
    void ScreenCapturePlugin.stop().catch(() => undefined);
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }

  videoTrack.addEventListener("ended", () => {
    cleanup();
  });

  return stream;
}

export async function stopNativeScreenCapture(): Promise<void> {
  if (!isNativeScreenCaptureAvailable()) return;
  try {
    await ScreenCapturePlugin.stop();
  } catch {
    // Non-fatal cleanup
  }
}
