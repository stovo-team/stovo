import { useEffect, useState } from "react";

import { getCachedAudioDuration, readAudioDurationFromUrl, setCachedAudioDuration } from "../../audioDurationCache";

export function useAudioDuration(fileId: string, sessionDuration: number | undefined, resolveDurationUrl?: () => Promise<string | null>) {
  const [knownDuration, setKnownDuration] = useState(() => getCachedAudioDuration(fileId) ?? 0);
  useEffect(() => {
    if (Number.isFinite(sessionDuration) && (sessionDuration ?? 0) > 0) {
      setCachedAudioDuration(fileId, sessionDuration!);
      setKnownDuration(sessionDuration!);
    }
  }, [fileId, sessionDuration]);
  useEffect(() => {
    const cached = getCachedAudioDuration(fileId);
    if (cached !== null) { setKnownDuration(cached); return; }
    if (!resolveDurationUrl) return;
    let cancelled = false;
    void resolveDurationUrl().then(async (url) => {
      if (!url || cancelled) return;
      const duration = await readAudioDurationFromUrl(url);
      if (!cancelled && duration !== null) { setCachedAudioDuration(fileId, duration); setKnownDuration(duration); }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [fileId, resolveDurationUrl]);
  return knownDuration;
}
