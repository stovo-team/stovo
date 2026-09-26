type BrowserTabCapture = { stream: MediaStream; track: MediaStreamTrack };

/** Capture the selected browser tab so the recording includes the complete app UI. */
export async function captureBrowserTab(): Promise<BrowserTabCapture> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Tab recording is unavailable in this browser. Use the latest Chrome or Edge.");
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
  const displaySurface = (track.getSettings() as MediaTrackSettings & { displaySurface?: string }).displaySurface;
  if (displaySurface && displaySurface !== "browser") {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error("Select the browser tab to record the full app interface.");
  }

  return { stream, track };
}
