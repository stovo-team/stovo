import { useEffect, useRef } from "react";

import { audioPlaybackSession } from "../../../audioPlaybackSession";
import { buildAudioSourceFactory } from "../shared/audioSourceFactory";
import { videoPlaybackSession } from "../../../videoPlaybackSession";

export type UseAudioSessionLifecycleParams = {
  accessToken: string | null;
  currentUserId: string | undefined;
};

/**
 * Owns the global audio-playback-session lifecycle: (re)connecting it to the
 * backend as the authenticated user changes (and clearing it on logout/user
 * switch), plus the audio-vs-video arbitration that pauses any playing
 * message video whenever audio playback starts.
 */
export function useAudioSessionLifecycle({ accessToken, currentUserId }: UseAudioSessionLifecycleParams) {
  const observedAudioUserIdRef = useRef<string | null>(currentUserId ?? null);
  const lastAudioVideoArbitrationRevisionRef = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nextUserId = currentUserId ?? null;
      const previousUserId = observedAudioUserIdRef.current;
      if (!nextUserId || !accessToken) {
        audioPlaybackSession.setSourceFactory(buildAudioSourceFactory(""));
        if (previousUserId) await audioPlaybackSession.clear("logout");
        observedAudioUserIdRef.current = null;
        return;
      }

      if (previousUserId && previousUserId !== nextUserId) {
        await audioPlaybackSession.clear("user-switch");
      }
      if (cancelled) return;
      observedAudioUserIdRef.current = nextUserId;
      audioPlaybackSession.setSourceFactory(buildAudioSourceFactory(accessToken));
      await audioPlaybackSession.connect();
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [accessToken, currentUserId]);

  useEffect(() => {
    return audioPlaybackSession.subscribe(() => {
      const snapshot = audioPlaybackSession.getSnapshot();
      if (
        snapshot.revision <= lastAudioVideoArbitrationRevisionRef.current ||
        !snapshot.identity ||
        snapshot.suppressionReason !== null ||
        (!snapshot.isPlaying && !snapshot.playWhenReady)
      ) {
        return;
      }
      lastAudioVideoArbitrationRevisionRef.current = snapshot.revision;
      videoPlaybackSession.pauseActive();
    });
  }, []);
}
