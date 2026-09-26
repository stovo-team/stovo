/**
 * useCallRecording — Universal call video recording hook.
 *
 * Records the meeting video & mixed audio stream, uploads the resulting WebM blob
 * to the backend storage upon stopping, and posts a video message artifact to the chat.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { getApiUrl } from "../../../api/client";
import { createMeetingRecordingVideoTrack, type RecordingMediaSources } from "./meetingRecordingComposer";
import { captureBrowserTab } from "./callSurfaceCapture";

export type RecordingState =
  | "idle"
  | "starting"
  | "recording"
  | "stopping"
  | "uploading"
  | "completed"
  | "failed";

export type UseCallRecordingParams = {
  accessToken: string | null;
  roomId: string | null;
  socketRef?: React.RefObject<Socket | null>;
  localStream?: MediaStream | null;
  localScreenStream?: MediaStream | null;
  remoteStreams?: { cameraStream: MediaStream | null; screenStream?: MediaStream | null }[];
  enabled?: boolean;
};

export type UseCallRecordingReturn = {
  recordingState: RecordingState;
  recordingId: string | null;
  recordingTimer: string;
  recordingDurationSeconds: number;
  recordingError: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  isRecordingActive: boolean;
};

export function useCallRecording({
  accessToken,
  roomId,
  socketRef,
  localStream,
  localScreenStream,
  remoteStreams = [],
  enabled = true,
}: UseCallRecordingParams): UseCallRecordingReturn {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const isInitiatorRef = useRef(false);
  const visualRecordingCleanupRef = useRef<(() => void) | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const mediaSourcesRef = useRef<RecordingMediaSources>({ localStream, localScreenStream, remoteStreams });
  mediaSourcesRef.current = { localStream, localScreenStream, remoteStreams };

  const reportRecordingFailure = useCallback(async (id: string, message: string) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/calls/${roomId}/recording/fail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: id, message }),
      });
      if (!response.ok) console.error("[useCallRecording] recording failure report rejected:", response.status);
    } catch (failureReportErr) {
      console.error("[useCallRecording] could not report recording failure:", failureReportErr);
    }
  }, [accessToken, roomId]);

  useEffect(() => () => visualRecordingCleanupRef.current?.(), []);

  // Format seconds to mm:ss or hh:mm:ss
  const formatTimer = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  // Timer runner
  useEffect(() => {
    if (recordingState === "recording") {
      setRecordingDurationSeconds(0);
      const startMs = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingDurationSeconds(Math.floor((Date.now() - startMs) / 1000));
      }, 1000);
    } else {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [recordingState]);

  // Socket event listeners
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket || !roomId) return;

    const onStarted = (payload: { roomId: string; recordingId: string }) => {
      if (payload.roomId !== roomId) return;
      recordingIdRef.current = payload.recordingId;
      setRecordingId(payload.recordingId);
      setRecordingState("recording");
      setRecordingError(null);
    };

    const onStopping = (payload: { roomId: string; recordingId: string }) => {
      if (payload.roomId !== roomId || payload.recordingId !== recordingIdRef.current) return;
      setRecordingState("stopping");
    };

    const onReady = (payload: { roomId: string; recordingId: string }) => {
      if (payload.roomId !== roomId || payload.recordingId !== recordingIdRef.current) return;
      setRecordingState("completed");
    };

    const onFailed = (payload: { roomId: string; recordingId: string; message?: string }) => {
      if (payload.roomId !== roomId) return;
      if (!recordingIdRef.current || recordingIdRef.current !== payload.recordingId) return;
      setRecordingId(payload.recordingId);
      setRecordingState("failed");
      setRecordingError(payload.message || "Recording failed");
    };

    socket.on("call.recording.started", onStarted);
    socket.on("call.recording.stopping", onStopping);
    socket.on("call.recording.ready", onReady);
    socket.on("call.recording.failed", onFailed);

    return () => {
      socket.off("call.recording.started", onStarted);
      socket.off("call.recording.stopping", onStopping);
      socket.off("call.recording.ready", onReady);
      socket.off("call.recording.failed", onFailed);
    };
  }, [socketRef, roomId]);

  const startRecording = useCallback(async () => {
    if (!accessToken || !roomId || !enabled || recordingState === "recording" || recordingState === "starting") {
      return;
    }
    setRecordingState("starting");
    setRecordingError(null);
    recordingIdRef.current = null;
    recordedChunksRef.current = [];
    isInitiatorRef.current = true;
    let surfaceCapture: Awaited<ReturnType<typeof captureBrowserTab>> | null = null;
    // Start the browser picker synchronously from the user gesture before the
    // first network await, as browsers require transient activation.
    const surfaceCapturePromise = captureBrowserTab();

    try {
      surfaceCapture = await surfaceCapturePromise;
      // 1. Tell backend to start recording
      const startRes = await fetch(`${getApiUrl()}/api/calls/${roomId}/recording/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!startRes.ok) {
        const errJson = await startRes.json().catch(() => ({}));
        throw new Error(errJson.message ?? `Failed to start recording (${startRes.status})`);
      }

      const startData = (await startRes.json()) as { id: string };
      setRecordingId(startData.id);
      recordingIdRef.current = startData.id;

      // 2. Compose every visible participant into one video track. Recording a
      // single camera track would omit the rest of the meeting (and used to
      // fall back to an audio-only placeholder before a camera was available).
      const tracksToRecord: MediaStreamTrack[] = [];
      const visualRecording = surfaceCapture ? null : createMeetingRecordingVideoTrack(mediaSourcesRef);
      visualRecordingCleanupRef.current = () => {
        visualRecording?.stop();
        surfaceCapture?.stream.getTracks().forEach((track) => track.stop());
      };
      tracksToRecord.push(surfaceCapture?.track ?? visualRecording!.track);

      // Audio mixing with Web Audio API
      let mixedAudioTrack: MediaStreamTrack | null = null;
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioContextRef.current = ctx;
          const dest = ctx.createMediaStreamDestination();

          // Connect local mic
          const localAudioTracks = localStream?.getAudioTracks().filter((t) => t.readyState === "live") ?? [];
          if (localAudioTracks.length > 0) {
            const localSource = ctx.createMediaStreamSource(new MediaStream(localAudioTracks));
            localSource.connect(dest);
          }

          // Connect remote audios
          for (const rem of remoteStreams) {
            const remAudioTracks = rem.cameraStream?.getAudioTracks().filter((t) => t.readyState === "live") ?? [];
            if (remAudioTracks.length > 0) {
              const remSource = ctx.createMediaStreamSource(new MediaStream(remAudioTracks));
              remSource.connect(dest);
            }
          }

          const destAudioTracks = dest.stream.getAudioTracks();
          if (destAudioTracks.length > 0) {
            mixedAudioTrack = destAudioTracks[0];
          }
        }
      } catch (audioMixErr) {
        console.warn("[useCallRecording] audio mix failed, using direct tracks:", audioMixErr);
      }

      if (mixedAudioTrack) {
        tracksToRecord.push(mixedAudioTrack);
      } else {
        const fallbackLocalAudio = localStream?.getAudioTracks().find((t) => t.readyState === "live");
        if (fallbackLocalAudio) tracksToRecord.push(fallbackLocalAudio);
      }

      const streamToRecord = new MediaStream(tracksToRecord);
      const mimeCandidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

      const recorder = new MediaRecorder(streamToRecord, {
        mimeType,
        videoBitsPerSecond: 1_500_000,
        audioBitsPerSecond: 128_000,
      });

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (!isInitiatorRef.current) return;
        const failRecording = async (message: string) => {
          setRecordingState("failed");
          setRecordingError(message);
          await reportRecordingFailure(startData.id, message);
        };
        if (visualRecording && !visualRecording.hasVideoFrames) {
          await failRecording("No video frames were captured");
          visualRecordingCleanupRef.current?.();
          visualRecordingCleanupRef.current = null;
          if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
          }
          return;
        }
        setRecordingState("uploading");
        try {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          const formData = new FormData();
          formData.append("file", blob, `meeting-recording.webm`);
          formData.append("recordingId", startData.id);

          const uploadRes = await fetch(`${getApiUrl()}/api/calls/${roomId}/recording/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
            body: formData,
          });

          if (!uploadRes.ok) {
            const uploadError = await uploadRes.json().catch(() => ({})) as { message?: string };
            throw new Error(uploadError.message ?? `Upload failed with status ${uploadRes.status}`);
          }

          setRecordingState("completed");
        } catch (uploadErr) {
          console.error("[useCallRecording] upload failed:", uploadErr);
          await failRecording(uploadErr instanceof Error ? uploadErr.message : "Recording upload failed");
        } finally {
          visualRecordingCleanupRef.current?.();
          visualRecordingCleanupRef.current = null;
          if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
          }
        }
      };

      recorder.start(1000); // 1s slices
      recorderRef.current = recorder;
      setRecordingState("recording");
    } catch (err) {
      visualRecordingCleanupRef.current?.();
      visualRecordingCleanupRef.current = null;
      surfaceCapture?.stream.getTracks().forEach((track) => track.stop());
      console.error("[useCallRecording] start failed:", err);
      setRecordingState("failed");
      const message = err instanceof Error ? err.message : "Failed to start recording";
      setRecordingError(message);
      if (recordingIdRef.current) await reportRecordingFailure(recordingIdRef.current, message);
    }
  }, [accessToken, roomId, enabled, recordingState, localStream, localScreenStream, remoteStreams, reportRecordingFailure]);

  const stopRecording = useCallback(async () => {
    if (!accessToken || !roomId || recordingState !== "recording") {
      return;
    }
    setRecordingState("stopping");

    try {
      // 1. Tell backend stopping
      await fetch(`${getApiUrl()}/api/calls/${roomId}/recording/stop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (stopErr) {
      console.warn("[useCallRecording] backend stop request failed:", stopErr);
    }

    // 2. Stop local recorder
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, [accessToken, roomId, recordingState]);

  return {
    recordingState,
    recordingId,
    recordingTimer: formatTimer(recordingDurationSeconds),
    recordingDurationSeconds,
    recordingError,
    startRecording,
    stopRecording,
    isRecordingActive: recordingState === "recording" || recordingState === "stopping" || recordingState === "uploading",
  };
}
