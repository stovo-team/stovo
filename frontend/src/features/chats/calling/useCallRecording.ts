/**
 * useCallRecording — Universal call video recording hook.
 *
 * Records the meeting video & mixed audio stream, uploads the resulting WebM blob
 * to the backend storage upon stopping, and posts a video message artifact to the chat.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { getApiUrl } from "../../../api/client";

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
      setRecordingId(payload.recordingId);
      setRecordingState("recording");
      setRecordingError(null);
    };

    const onStopping = (payload: { roomId: string }) => {
      if (payload.roomId !== roomId) return;
      setRecordingState("stopping");
    };

    const onReady = (payload: { roomId: string }) => {
      if (payload.roomId !== roomId) return;
      setRecordingState("completed");
    };

    socket.on("call.recording.started", onStarted);
    socket.on("call.recording.stopping", onStopping);
    socket.on("call.recording.ready", onReady);

    return () => {
      socket.off("call.recording.started", onStarted);
      socket.off("call.recording.stopping", onStopping);
      socket.off("call.recording.ready", onReady);
    };
  }, [socketRef, roomId]);

  const startRecording = useCallback(async () => {
    if (!accessToken || !roomId || !enabled || recordingState === "recording" || recordingState === "starting") {
      return;
    }
    setRecordingState("starting");
    setRecordingError(null);
    recordedChunksRef.current = [];
    isInitiatorRef.current = true;

    try {
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

      // 2. Mix media streams on client
      const tracksToRecord: MediaStreamTrack[] = [];

      // Prefer screen video if available, else camera video
      const screenVideoTrack = localScreenStream?.getVideoTracks().find((t) => t.readyState === "live");
      const localVideoTrack = localStream?.getVideoTracks().find((t) => t.readyState === "live");

      if (screenVideoTrack) {
        tracksToRecord.push(screenVideoTrack);
      } else if (localVideoTrack) {
        tracksToRecord.push(localVideoTrack);
      } else {
        // Find any remote video track
        for (const rem of remoteStreams) {
          const remTrack = rem.screenStream?.getVideoTracks().find((t) => t.readyState === "live") ??
                           rem.cameraStream?.getVideoTracks().find((t) => t.readyState === "live");
          if (remTrack) {
            tracksToRecord.push(remTrack);
            break;
          }
        }
      }

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

      // If no video track found, create a black canvas stream as placeholder
      if (!tracksToRecord.some((t) => t.kind === "video")) {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 1280;
          canvas.height = 720;
          const cCtx = canvas.getContext("2d");
          if (cCtx) {
            cCtx.fillStyle = "#090d16";
            cCtx.fillRect(0, 0, 1280, 720);
            cCtx.fillStyle = "#ffffff";
            cCtx.font = "bold 32px sans-serif";
            cCtx.textAlign = "center";
            cCtx.fillText("Stovo Meeting Audio Recording", 640, 360);
          }
          const canvasStream = canvas.captureStream(1);
          const cVideoTrack = canvasStream.getVideoTracks()[0];
          if (cVideoTrack) tracksToRecord.push(cVideoTrack);
        } catch {
          // ignore canvas failure
        }
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
        setRecordingState("uploading");
        try {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          const formData = new FormData();
          formData.append("file", blob, `meeting-recording.webm`);

          const uploadRes = await fetch(`${getApiUrl()}/api/calls/${roomId}/recording/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
            body: formData,
          });

          if (!uploadRes.ok) {
            throw new Error(`Upload failed with status ${uploadRes.status}`);
          }

          setRecordingState("completed");
        } catch (uploadErr) {
          console.error("[useCallRecording] upload failed:", uploadErr);
          setRecordingState("failed");
          setRecordingError(uploadErr instanceof Error ? uploadErr.message : "Recording upload failed");
        } finally {
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
      console.error("[useCallRecording] start failed:", err);
      setRecordingState("failed");
      setRecordingError(err instanceof Error ? err.message : "Failed to start recording");
    }
  }, [accessToken, roomId, enabled, recordingState, localStream, localScreenStream, remoteStreams]);

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
