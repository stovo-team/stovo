type CallSurfaceCapture = { stream: MediaStream; track: MediaStreamTrack };

/** Capture the rendered call element, not just its camera/screen-share tracks. */
export async function captureCallSurface(): Promise<CallSurfaceCapture | null> {
  const surface = document.querySelector<HTMLElement>("[data-call-recording-surface]");
  if (!surface || !navigator.mediaDevices?.getDisplayMedia) return null;

  const captureApis = globalThis as typeof globalThis & {
    RestrictionTarget?: { fromElement: (element: Element) => Promise<unknown> };
    CropTarget?: { fromElement: (element: Element) => Promise<unknown> };
  };
  if (!captureApis.RestrictionTarget && !captureApis.CropTarget) {
    throw new Error("This browser cannot capture the call area. Use the latest Chrome or Edge to record calls.");
  }

  const mediaDevices = navigator.mediaDevices as MediaDevices & {
    getDisplayMedia: (constraints?: MediaStreamConstraints & Record<string, unknown>) => Promise<MediaStream>;
  };
  const stream = await mediaDevices.getDisplayMedia({
    video: { displaySurface: "browser" } as MediaTrackConstraints,
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    monitorTypeSurfaces: "exclude",
  });
  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error("The selected browser tab did not provide a video track.");
  }

  const elementTrack = track as MediaStreamTrack & {
    restrictTo?: (target: unknown) => Promise<void>;
    cropTo?: (target: unknown) => Promise<void>;
  };
  try {
    if (captureApis.RestrictionTarget && elementTrack.restrictTo) {
      await elementTrack.restrictTo(await captureApis.RestrictionTarget.fromElement(surface));
    } else if (captureApis.CropTarget && elementTrack.cropTo) {
      await elementTrack.cropTo(await captureApis.CropTarget.fromElement(surface));
    } else {
      throw new Error("This browser cannot capture the call area. Use the latest Chrome or Edge to record calls.");
    }
  } catch (error) {
    stream.getTracks().forEach((item) => item.stop());
    throw error;
  }
  return { stream, track };
}
