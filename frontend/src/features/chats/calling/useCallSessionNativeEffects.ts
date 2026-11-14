import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { isNativeScreenCapturePermissionPending } from "../../../native/screenCapturePlugin";

import {
  addPictureInPictureListener,
  addProximityListener,
  disableNativeCallMode,
  enableNativeCallMode,
  enterNativePictureInPictureIfPossible,
  isNativeCallPluginAvailable,
  setNativeActiveCallState,
  type PictureInPictureState
} from "../../../native/callPlugin";
import type { CallSettings } from "../../../realtime/CallController";
import type { CallPhase } from "../shared/types";

type NativeEffectsParams = {
  callPhase: CallPhase;
  callAudioSettings: CallSettings;
  callPhaseRef: MutableRefObject<CallPhase>;
  activeCallChatIdRef: MutableRefObject<string | null>;
  activeCallSessionIdRef: MutableRefObject<string | null>;
  pictureInPictureActiveRef: MutableRefObject<boolean>;
  videoPictureInPictureActiveRef: MutableRefObject<boolean>;
  lastNativeVideoRevisionRef: MutableRefObject<number>;
  setIsProximityNear: Dispatch<SetStateAction<boolean>>;
  setIsVideoPictureInPictureActive: Dispatch<SetStateAction<boolean>>;
  setIsCallMinimized: Dispatch<SetStateAction<boolean>>;
  syncNativePictureInPictureCallState: () => void;
  restoreActiveCallSurface: () => void;
  restoreActiveVideoSurface: (state: PictureInPictureState) => void;
};

export function shouldEnterCallPictureInPicture(
  isActive: boolean,
  callPhase: CallPhase,
  screenCapturePermissionPending: boolean,
): boolean {
  return !isActive && callPhase !== "idle" && !screenCapturePermissionPending;
}

/** Owns Android lifecycle, proximity, and PiP listeners for an active call. */
export function useCallSessionNativeEffects({
  callPhase,
  callAudioSettings,
  callPhaseRef,
  activeCallChatIdRef,
  activeCallSessionIdRef,
  pictureInPictureActiveRef,
  videoPictureInPictureActiveRef,
  lastNativeVideoRevisionRef,
  setIsProximityNear,
  setIsVideoPictureInPictureActive,
  setIsCallMinimized,
  syncNativePictureInPictureCallState,
  restoreActiveCallSurface,
  restoreActiveVideoSurface
}: NativeEffectsParams) {
  useEffect(() => {
    syncNativePictureInPictureCallState();
  }, [callPhase, syncNativePictureInPictureCallState]);

  useEffect(() => {
    if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android")) return;
    let disposed = false;
    let removeListener: (() => void) | null = null;
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!shouldEnterCallPictureInPicture(isActive, callPhaseRef.current, isNativeScreenCapturePermissionPending())) return;
      const sessionId = activeCallSessionIdRef.current;
      if (!sessionId) return;
      void setNativeActiveCallState({ active: true, video: true, chatId: activeCallChatIdRef.current, sessionId })
        .finally(() => { void enterNativePictureInPictureIfPossible(); });
    }).then((listener) => {
      if (disposed) listener.remove(); else removeListener = () => listener.remove();
    });
    return () => { disposed = true; removeListener?.(); };
  }, [activeCallChatIdRef, activeCallSessionIdRef, callPhaseRef]);

  useEffect(() => {
    if (!isNativeCallPluginAvailable() || callPhase === "idle") {
      setIsProximityNear(false);
      void disableNativeCallMode();
      return;
    }
    const earpiece = callAudioSettings.speakerMode === "small" && !callAudioSettings.outputDeviceId;
    void enableNativeCallMode(earpiece);
    let removeListener: (() => void) | undefined;
    void addProximityListener((near) => setIsProximityNear(near)).then((remove) => { removeListener = remove; });
    return () => { removeListener?.(); setIsProximityNear(false); void disableNativeCallMode(); };
  }, [callAudioSettings.outputDeviceId, callAudioSettings.speakerMode, callPhase, setIsProximityNear]);

  useEffect(() => {
    if (callPhase === "idle") pictureInPictureActiveRef.current = false;
  }, [callPhase, pictureInPictureActiveRef]);

  useEffect(() => {
    if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android")) return;
    let cancelled = false;
    let removeListener: (() => void) | null = null;
    void addPictureInPictureListener((state: PictureInPictureState) => {
      pictureInPictureActiveRef.current = state.active;
      if (Number.isSafeInteger(state.acceptedRevision) && state.acceptedRevision >= 0) {
        lastNativeVideoRevisionRef.current = Math.max(lastNativeVideoRevisionRef.current, state.acceptedRevision);
      }
      if (state.active) {
        const videoOwner = state.owner === "video";
        videoPictureInPictureActiveRef.current = videoOwner;
        setIsVideoPictureInPictureActive(videoOwner);
        setIsCallMinimized(false);
        return;
      }
      videoPictureInPictureActiveRef.current = false;
      setIsVideoPictureInPictureActive(false);
      if (state.owner === "video") restoreActiveVideoSurface(state);
      else if (state.owner === "call" && callPhaseRef.current !== "idle") restoreActiveCallSurface();
    }).then((remove) => { if (cancelled) remove(); else removeListener = remove; });
    return () => { cancelled = true; removeListener?.(); };
  }, [callPhaseRef, lastNativeVideoRevisionRef, pictureInPictureActiveRef, restoreActiveCallSurface, restoreActiveVideoSurface, setIsCallMinimized, setIsVideoPictureInPictureActive, videoPictureInPictureActiveRef]);
}
