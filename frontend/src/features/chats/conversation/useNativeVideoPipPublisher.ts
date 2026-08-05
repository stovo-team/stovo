import { Dispatch, RefObject, SetStateAction, useEffect } from "react";

import { isNativeCallPluginAvailable, setNativeActiveVideoState } from "../../../native/callPlugin";
import { toNativeVideoPictureInPictureState } from "../../../videoPiPBridge";
import { videoPlaybackSession } from "../../../videoPlaybackSession";
import { activeSessionVideoElement } from "../shared/callLifecycle";
import type { CallPhase } from "../shared/types";

export type UseNativeVideoPipPublisherParams = {
  currentUserId: string | undefined;
  callPhaseRef: RefObject<CallPhase>;
  videoPictureInPictureActiveRef: RefObject<boolean>;
  setIsVideoPictureInPictureActive: Dispatch<SetStateAction<boolean>>;
  lastNativeVideoRevisionRef: RefObject<number>;
};

/**
 * Publishes the current message-video playback snapshot to the native
 * picture-in-picture plugin (throttling position-only updates), and reports
 * the video as non-playing while a call is active so the call UI owns focus.
 * Must be wired up after `useCallSession` exists since it reads
 * `callPhaseRef` from it.
 */
export function useNativeVideoPipPublisher({
  currentUserId,
  callPhaseRef,
  videoPictureInPictureActiveRef,
  setIsVideoPictureInPictureActive,
  lastNativeVideoRevisionRef
}: UseNativeVideoPipPublisherParams) {
  useEffect(() => {
    if (!currentUserId) return;

    let disposed = false;
    let throttleTimer: number | null = null;
    let pendingUpdate: ReturnType<typeof toNativeVideoPictureInPictureState> | null = null;
    let previousUpdate: ReturnType<typeof toNativeVideoPictureInPictureState> | null = null;

    const sendUpdate = (update: ReturnType<typeof toNativeVideoPictureInPictureState>) => {
      if (disposed) return;
      lastNativeVideoRevisionRef.current = Math.max(lastNativeVideoRevisionRef.current, update.revision);
      previousUpdate = update;
      if (!isNativeCallPluginAvailable()) return;
      void setNativeActiveVideoState(update).then((state) => {
        if (!state || disposed) return;
        lastNativeVideoRevisionRef.current = Math.max(lastNativeVideoRevisionRef.current, state.acceptedRevision);
      });
    };

    const publish = () => {
      const snapshot = videoPlaybackSession.getSnapshot();
      if (!snapshot) {
        if (throttleTimer !== null) window.clearTimeout(throttleTimer);
        throttleTimer = null;
        pendingUpdate = null;
        if (videoPictureInPictureActiveRef.current) {
          videoPictureInPictureActiveRef.current = false;
          setIsVideoPictureInPictureActive(false);
        }
      }
      const element = activeSessionVideoElement();
      const update = toNativeVideoPictureInPictureState(
        snapshot,
        { width: element?.videoWidth ?? 0, height: element?.videoHeight ?? 0 },
        lastNativeVideoRevisionRef.current + 1
      );
      if (callPhaseRef.current !== "idle") update.playing = false;

      const positionOnly = Boolean(
        previousUpdate &&
          update.active === previousUpdate.active &&
          update.playing === previousUpdate.playing &&
          update.chatId === previousUpdate.chatId &&
          update.messageId === previousUpdate.messageId &&
          update.fileId === previousUpdate.fileId &&
          update.durationSeconds === previousUpdate.durationSeconds &&
          update.width === previousUpdate.width &&
          update.height === previousUpdate.height &&
          Math.abs(update.positionSeconds - previousUpdate.positionSeconds) < 2
      );

      if (!positionOnly) {
        if (throttleTimer !== null) window.clearTimeout(throttleTimer);
        throttleTimer = null;
        pendingUpdate = null;
        sendUpdate(update);
        return;
      }

      pendingUpdate = update;
      if (throttleTimer !== null) return;
      throttleTimer = window.setTimeout(() => {
        throttleTimer = null;
        const latest = pendingUpdate;
        pendingUpdate = null;
        if (latest) sendUpdate(latest);
      }, 500);
    };

    const unsubscribe = videoPlaybackSession.subscribe(publish);
    publish();
    return () => {
      disposed = true;
      unsubscribe();
      if (throttleTimer !== null) window.clearTimeout(throttleTimer);
      videoPictureInPictureActiveRef.current = false;
      const inactive = toNativeVideoPictureInPictureState(null, undefined, lastNativeVideoRevisionRef.current + 1);
      lastNativeVideoRevisionRef.current = inactive.revision;
      void setNativeActiveVideoState(inactive);
      videoPlaybackSession.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);
}
