/**
 * Remembers audio durations by file id so inactive in-message players can show
 * length before the shared playback session is attached to that track.
 */
const durationsByFileId = new Map<string, number>();

export function getCachedAudioDuration(fileId: string): number | null {
  const key = fileId.trim();
  if (!key) return null;
  const value = durationsByFileId.get(key);
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}

export function setCachedAudioDuration(fileId: string, durationSeconds: number): void {
  const key = fileId.trim();
  if (!key || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
  durationsByFileId.set(key, durationSeconds);
}

export function clearCachedAudioDuration(fileId?: string): void {
  if (fileId === undefined) {
    durationsByFileId.clear();
    return;
  }
  durationsByFileId.delete(fileId.trim());
}

/** Reads duration from a playable URL via HTMLAudioElement metadata (blob or http). */
export function readAudioDurationFromUrl(url: string): Promise<number | null> {
  if (!url.trim() || typeof Audio === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const element = new Audio();
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      element.removeAttribute("src");
      try {
        element.load();
      } catch {
        // Synthetic elements may reject teardown.
      }
      resolve(value);
    };
    element.preload = "metadata";
    element.addEventListener("loadedmetadata", () => {
      const duration = element.duration;
      // Some WebViews report a container's declared duration (occasionally many
      // times the playable length) before their seekable range is finalized.
      // The end of that range is the duration that the user can actually seek to.
      const seekableEnd = (() => {
        try {
          const ranges = element.seekable;
          return ranges.length > 0 ? ranges.end(ranges.length - 1) : 0;
        } catch {
          return 0;
        }
      })();
      const hasSeekableEnd = Number.isFinite(seekableEnd) && seekableEnd > 0;
      const resolvedDuration =
        hasSeekableEnd && (!Number.isFinite(duration) || duration <= 0 || seekableEnd < duration)
          ? seekableEnd
          : duration;
      finish(Number.isFinite(resolvedDuration) && resolvedDuration > 0 ? resolvedDuration : null);
    });
    element.addEventListener("error", () => finish(null));
    element.src = url;
  });
}
