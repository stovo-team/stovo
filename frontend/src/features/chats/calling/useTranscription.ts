/**
 * useTranscription — AI call transcription state and actions.
 *
 * Manages the lifecycle of an AI transcription session attached to an active
 * call. The hook is intentionally self-contained: it owns its own state and
 * communicates with the backend via fetch + the existing socketRef.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { getApiUrl } from "../../../api/client";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TranscriptState =
  | "idle"        // No transcription in this session
  | "starting"    // Request sent, waiting for server ack
  | "recording"   // Server confirmed: actively collecting audio
  | "stopping"    // User clicked stop, waiting for server
  | "processing"  // Server transcribing and summarising
  | "ready"       // Transcript is available for viewing
  | "failed";     // Unrecoverable error

export type TranscriptSegment = {
  id: string;
  callId: string;
  sessionId: string;
  participantId: string;
  participantName: string;
  startMs: number;
  endMs: number;
  exactText: string;
  cleanedText: string | null;
  detectedLanguage: string | null;
  confidence: number | null;
};

export type TranscriptSummary = {
  summary: string;
  decisions: { text: string; sourceSegmentIds: string[] }[];
  actionItems: {
    text: string;
    assigneeParticipantId: string | null;
    dueDate: string | null;
    sourceSegmentIds: string[];
  }[];
  openQuestions: { text: string; sourceSegmentIds: string[] }[];
};

export type TranscriptData = {
  session: {
    id: string;
    callId: string;
    initiatedBy: string;
    status: string;
    provider: string;
    providerModel: string;
    startedAt: string | null;
    stoppedAt: string | null;
    completedAt: string | null;
    submittedAudioMs: number;
    estimatedCostUsd: number | null;
    detectedLanguages: string[];
    failureCode: string | null;
    failureMessage: string | null;
    createdAt: string;
  };
  segments: TranscriptSegment[];
  summary: TranscriptSummary | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Audio chunk uploader
// ─────────────────────────────────────────────────────────────────────────────

export type AudioChunkUploadParams = {
  accessToken: string;
  roomId: string;
  sessionId: string;
  participantId: string;
  sequence: number;
  container: "webm" | "ogg" | "mp4";
  callStartMs: number;
  callEndMs: number;
  durationMs: number;
  clientVadScore: number;
  blob: Blob;
};

/** Request a presigned URL and upload a single audio chunk to MinIO. */
export async function uploadAudioChunk(params: AudioChunkUploadParams): Promise<void> {
  // 1. Request presigned URL from backend.
  const urlResponse = await fetch(`${getApiUrl()}/api/calls/${params.roomId}/transcription/uploads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      sessionId: params.sessionId,
      participantId: params.participantId,
      sequence: params.sequence,
      container: params.container,
      callStartMs: params.callStartMs,
      callEndMs: params.callEndMs,
      durationMs: params.durationMs,
      clientVadScore: params.clientVadScore,
    }),
  });
  if (!urlResponse.ok) {
    const detail = await urlResponse.json().catch(() => ({})) as { detail?: string };
    throw new Error(detail.detail ?? `Failed to get upload URL: ${urlResponse.status}`);
  }
  const { chunkId, uploadUrl } = (await urlResponse.json()) as {
    chunkId: string;
    uploadUrl: string;
    objectKey: string;
    expiresAt: string;
  };

  // 2. Upload directly to MinIO.
  const uploadTarget = uploadUrl.startsWith("http") ? uploadUrl : `${getApiUrl()}${uploadUrl}`;
  const uploadResponse = await fetch(uploadTarget, {
    method: "PUT",
    headers: {
      "Content-Type": params.container === "ogg" ? "audio/ogg" : params.container === "mp4" ? "audio/mp4" : "audio/webm",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: params.blob,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Audio upload failed: ${uploadResponse.status}`);
  }

  // 3. Confirm completion to backend.
  const completeResponse = await fetch(`${getApiUrl()}/api/calls/${params.roomId}/transcription/uploads/${chunkId}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({ checksum: "", sizeBytes: params.blob.size }),
  });
  if (!completeResponse.ok) {
    const detail = await completeResponse.json().catch(() => ({})) as { detail?: string };
    throw new Error(detail.detail ?? `Audio upload confirmation failed: ${completeResponse.status}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export type UseTranscriptionParams = {
  accessToken: string | null;
  roomId: string | null;
  currentUserId: string | null;
  socketRef?: React.RefObject<Socket | null>;
  /** The existing local call stream, including for audio-only calls. */
  localAudioStream?: MediaStream | null;
  /** Whether AI transcription is available at all (config flag from the server). */
  enabled?: boolean;
};

export type UseTranscriptionReturn = {
  transcriptState: TranscriptState;
  transcriptSessionId: string | null;
  transcriptData: TranscriptData | null;
  transcriptError: string | null;
  isTranscriptPanelOpen: boolean;
  toggleTranscriptPanel: () => void;
  startTranscription: () => Promise<void>;
  stopTranscription: () => Promise<void>;
  fetchTranscript: () => Promise<void>;
  resetTranscription: () => void;
};

export function useTranscription({
  accessToken,
  roomId,
  currentUserId,
  socketRef,
  localAudioStream,
  enabled = true,
}: UseTranscriptionParams): UseTranscriptionReturn {
  const [transcriptState, setTranscriptState] = useState<TranscriptState>("idle");
  const [transcriptSessionId, setTranscriptSessionId] = useState<string | null>(null);
  const [transcriptData, setTranscriptData] = useState<TranscriptData | null>(null);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [isTranscriptPanelOpen, setIsTranscriptPanelOpen] = useState(false);

  // Stable ref to latest state so socket handlers don't capture stale closures.
  const stateRef = useRef<TranscriptState>("idle");
  stateRef.current = transcriptState;
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = transcriptSessionId;
  // Stopping MediaRecorder emits its last chunk asynchronously. Keep a handle
  // to that flush so the manual stop request cannot race the final upload.
  const flushRecorderRef = useRef<(() => Promise<void>) | null>(null);
  const isStoppingRef = useRef(false);

  // ── Audio Recorder Effect ────────────────────────────────────────────────
  useEffect(() => {
    if (transcriptState !== "recording" || !accessToken || !roomId || !currentUserId || !transcriptSessionId) {
      return;
    }

    let recorder: MediaRecorder | null = null;
    let sequence = 0;
    const recordingStartMs = Date.now();
    let clipStartMs = 0;
    let lastSpeechMs = 0;
    let clipVoicedSamples = 0;
    let clipTotalSamples = 0;
    let activeStream: MediaStream | null = null;
    let vadContext: AudioContext | null = null;
    let vadTimer: number | undefined;
    let voicedSamples = 0;
    let totalSamples = 0;
    let stopStreamOnCleanup = false;
    let isActive = true;
    let isRecordingEnabled = true;
    let flushRecorder: (() => Promise<void>) | null = null;
    let resolveRecorderStopped: (() => void) | null = null;
    const recorderStopped = new Promise<void>((resolve) => {
      resolveRecorderStopped = resolve;
    });
    const pendingUploads = new Set<Promise<void>>();

    const failRecording = (message: string) => {
      if (!isActive) return;
      setTranscriptState("failed");
      setTranscriptError(message);
    };

    const startRecording = async () => {
      try {
        let stream: MediaStream;
        const liveLocalTracks = localAudioStream?.getAudioTracks().filter((track) => track.readyState === "live") ?? [];
        if (liveLocalTracks.length > 0) {
          stream = new MediaStream(liveLocalTracks);
        } else {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: { ideal: 1 },
              sampleRate: { ideal: 48000 },
            },
          });
          stopStreamOnCleanup = true;
        }
        activeStream = stream;

        // Lightweight client VAD gates whole recorder intervals before they
        // leave the device. A brief hangover keeps word endings from clipping.
        vadContext = new AudioContext();
        const vadSource = vadContext.createMediaStreamSource(stream);
        const vadAnalyser = vadContext.createAnalyser();
        vadAnalyser.fftSize = 512;
        vadSource.connect(vadAnalyser);
        const vadSamples = new Float32Array(vadAnalyser.fftSize);
        vadTimer = window.setInterval(() => {
          if (!isRecordingEnabled) return;
          vadAnalyser.getFloatTimeDomainData(vadSamples);
          let energy = 0;
          for (const sample of vadSamples) energy += sample * sample;
          const rms = Math.sqrt(energy / vadSamples.length);
          const callTimeMs = Date.now() - recordingStartMs;
          if (rms >= 0.012) {
            if (recorder?.state === "inactive") {
              clipStartMs = Math.max(0, callTimeMs - 50);
              clipVoicedSamples = 0;
              clipTotalSamples = 0;
              recorder.start();
            }
            lastSpeechMs = callTimeMs;
            clipVoicedSamples += 1;
          }
          if (recorder?.state === "recording") {
            clipTotalSamples += 1;
            if (callTimeMs - lastSpeechMs >= 600) recorder.stop();
          }
        }, 50);

        if (typeof MediaRecorder === "undefined") {
          throw new Error("AI Notes recording is not supported in this browser");
        }
        const mimeCandidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
        const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type));
        if (!mimeType) {
          throw new Error("This browser does not support an AI Notes audio format");
        }
        const container: "webm" | "ogg" | "mp4" = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";

        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
        recorder.ondataavailable = async (e: BlobEvent) => {
          if (e.data && e.data.size > 0) {
            const clientVadScore = clipTotalSamples > 0 ? clipVoicedSamples / clipTotalSamples : 0;
            const voicedDurationMs = clipVoicedSamples * 50;
            const seq = sequence++;
            const callStartMs = clipStartMs;
            const callEndMs = Date.now() - recordingStartMs;
            const durationMs = Math.max(1, callEndMs - callStartMs);
            clipVoicedSamples = 0;
            clipTotalSamples = 0;

            if (clientVadScore < 0.04 || voicedDurationMs < 200) return;

            let upload: Promise<void>;
            upload = uploadAudioChunk({
                accessToken,
                roomId,
                sessionId: transcriptSessionId,
                participantId: currentUserId,
                sequence: seq,
                container,
                callStartMs,
                callEndMs,
                durationMs,
                clientVadScore,
                blob: e.data,
              })
              .catch((uploadErr) => {
                console.warn("[useTranscription] chunk upload failed seq=", seq, uploadErr);
                failRecording(uploadErr instanceof Error ? uploadErr.message : "AI Notes could not upload audio. Check the server storage connection.");
              })
              .finally(() => pendingUploads.delete(upload));
            pendingUploads.add(upload);
          }
        };

        // Recording starts and stops around detected speech; silence never
        // becomes an upload. The hangover above preserves trailing phonemes.
        recorder.onerror = () => failRecording("AI Notes recording failed in this browser");
        recorder.onstop = () => resolveRecorderStopped?.();
        flushRecorder = async () => {
          isRecordingEnabled = false;
          if (recorder && recorder.state !== "inactive") {
            recorder.stop();
          }
          // `dataavailable` is delivered before `stop`, but do not leave the
          // stop control hung if a browser fails to emit the terminal event.
          await Promise.race([
            recorderStopped,
            new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
          ]);
          // A network request may stall indefinitely; the server also waits
          // for pending uploads, so let it take over after a bounded wait.
          await Promise.race([
            Promise.all([...pendingUploads]),
            new Promise<void>((resolve) => window.setTimeout(resolve, 10000)),
          ]);
        };
        flushRecorderRef.current = flushRecorder;
      } catch (err) {
        console.error("[useTranscription] MediaRecorder init failed:", err);
        failRecording(err instanceof Error ? err.message : "AI Notes recording could not start");
      }
    };

    void startRecording();

    return () => {
      isActive = false;
      isRecordingEnabled = false;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      if (vadTimer !== undefined) window.clearInterval(vadTimer);
      void vadContext?.close();
      if (flushRecorderRef.current === flushRecorder) {
        flushRecorderRef.current = null;
      }
      if (stopStreamOnCleanup && activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [transcriptState, accessToken, roomId, currentUserId, transcriptSessionId, localAudioStream]);

  // ── Socket event listeners ──────────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    const onRecording = (payload: { sessionId: string; status: string }) => {
      if (payload.status === "recording") {
        setTranscriptSessionId(payload.sessionId);
        setTranscriptState("recording");
        setTranscriptError(null);
      }
    };

    const onStopping = (payload: { sessionId: string; status: string }) => {
      if (sessionIdRef.current === payload.sessionId || payload.status === "stopping") {
        setTranscriptState("stopping");
      }
    };

    const onTranscribing = (payload: { sessionId: string; status: string }) => {
      if (
        sessionIdRef.current === payload.sessionId ||
        payload.status === "transcribing"
      ) {
        setTranscriptState("processing");
      }
    };

    const onReady = (payload: { sessionId: string; status: string }) => {
      if (
        sessionIdRef.current === payload.sessionId ||
        payload.status === "ready"
      ) {
        setTranscriptState("ready");
      }
    };

    const onFailed = (payload: { sessionId: string; status: string; failureMessage?: string }) => {
      if (
        sessionIdRef.current === payload.sessionId ||
        payload.status === "failed"
      ) {
        setTranscriptState("failed");
        setTranscriptError(payload.failureMessage || "Transcription failed. Please try again.");
      }
    };

    // A terminal call event is a fallback for the server's explicit
    // transcription-stopping event. It guarantees recorder cleanup even when
    // a call ends while the client is backgrounded or its stop event is late.
    const onCallEnded = (payload: { roomId?: string }) => {
      if (payload.roomId && roomId && payload.roomId !== roomId) return;
      if (stateRef.current === "recording") {
        setTranscriptState("stopping");
      }
    };

    socket.on("call.transcription.recording", onRecording);
    socket.on("call.transcription.stopping", onStopping);
    socket.on("call.transcription.transcribing", onTranscribing);
    socket.on("call.transcription.ready", onReady);
    socket.on("call.transcription.failed", onFailed);
    socket.on("call:ended", onCallEnded);

    return () => {
      socket.off("call.transcription.recording", onRecording);
      socket.off("call.transcription.stopping", onStopping);
      socket.off("call.transcription.transcribing", onTranscribing);
      socket.off("call.transcription.ready", onReady);
      socket.off("call.transcription.failed", onFailed);
      socket.off("call:ended", onCallEnded);
    };
  }, [socketRef, roomId]);

  // ── Actions ────────────────────────────────────────────────────────────

  const startTranscription = useCallback(async () => {
    if (!accessToken || !roomId || !enabled) return;
    isStoppingRef.current = false;
    setTranscriptState("starting");
    setTranscriptError(null);
    try {
      const response = await fetch(`${getApiUrl()}/api/calls/${roomId}/transcription/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({ detail: "Failed to start transcription" }))) as {
          detail?: string;
        };
        throw new Error(err.detail ?? "Failed to start transcription");
      }
      const data = (await response.json().catch(() => {
        throw new Error("AI Notes service returned an invalid response. Check the configured server URL.");
      })) as { id: string; status: string };
      setTranscriptSessionId(data.id);
      setTranscriptState("recording");
    } catch (err) {
      console.error("[useTranscription] start failed:", err);
      setTranscriptState("failed");
      setTranscriptError(err instanceof Error ? err.message : "Failed to start transcription");
    }
  }, [accessToken, roomId, enabled]);

  const stopTranscription = useCallback(async () => {
    if (!accessToken || !roomId || !sessionIdRef.current || isStoppingRef.current) return;
    isStoppingRef.current = true;
    try {
      // Flush MediaRecorder before telling the server to process the session.
      // Without this, a short call can be processed before its only (terminal)
      // chunk has finished uploading.
      await flushRecorderRef.current?.();
    } catch (err) {
      console.warn("[useTranscription] recorder flush failed:", err);
    }
    setTranscriptState("stopping");
    try {
      const response = await fetch(`${getApiUrl()}/api/calls/${roomId}/transcription/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
      if (!response.ok) {
        throw new Error(`Stop failed: ${response.status}`);
      }
      setTranscriptState("processing");
    } catch (err) {
      console.error("[useTranscription] stop failed:", err);
      setTranscriptState("failed");
      setTranscriptError(err instanceof Error ? err.message : "Failed to stop transcription");
    } finally {
      isStoppingRef.current = false;
    }
  }, [accessToken, roomId]);

  const fetchTranscript = useCallback(async () => {
    if (!accessToken || !roomId) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/calls/${roomId}/transcript`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`Fetch transcript failed: ${response.status}`);
      }
      const data = (await response.json()) as TranscriptData;
      setTranscriptData(data);
    } catch (err) {
      console.error("[useTranscription] fetch failed:", err);
    }
  }, [accessToken, roomId]);

  // Auto-fetch when transcript becomes ready.
  useEffect(() => {
    if (transcriptState === "ready" && roomId && accessToken) {
      void fetchTranscript();
    }
  }, [transcriptState, roomId, accessToken, fetchTranscript]);

  // Socket events normally deliver completion, but can be missed when the
  // client backgrounds or reconnects. Poll while processing so the control
  // cannot remain on its spinner indefinitely.
  useEffect(() => {
    if (transcriptState !== "processing" || !roomId || !accessToken) return;
    let active = true;
    const pollStatus = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/calls/${roomId}/transcription/status`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return;
        const payload = await response.json() as { status?: string; session?: { status?: string; failureMessage?: string }; failureMessage?: string; failure_message?: string };
        if (!active) return;
        const status = payload.status ?? payload.session?.status;
        if (status === "ready" || status === "completed") setTranscriptState("ready");
        else if (status === "failed" || status === "none") {
          setTranscriptState("failed");
          setTranscriptError(payload.failureMessage ?? payload.failure_message ?? payload.session?.failureMessage ?? "Transcription failed. Please try again.");
        }
      } catch {
        // A temporary network failure should not interrupt server-side work;
        // the next poll or socket event can still complete the state change.
      }
    };
    void pollStatus();
    const timer = window.setInterval(() => void pollStatus(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [transcriptState, roomId, accessToken]);

  const toggleTranscriptPanel = useCallback(() => {
    setIsTranscriptPanelOpen((v) => !v);
    if (!isTranscriptPanelOpen && transcriptState === "ready" && !transcriptData) {
      void fetchTranscript();
    }
  }, [isTranscriptPanelOpen, transcriptState, transcriptData, fetchTranscript]);

  const resetTranscription = useCallback(() => {
    isStoppingRef.current = false;
    setTranscriptState("idle");
    setTranscriptSessionId(null);
    setTranscriptData(null);
    setTranscriptError(null);
    setIsTranscriptPanelOpen(false);
  }, []);

  return {
    transcriptState,
    transcriptSessionId,
    transcriptData,
    transcriptError,
    isTranscriptPanelOpen,
    toggleTranscriptPanel,
    startTranscription,
    stopTranscription,
    fetchTranscript,
    resetTranscription,
  };
}
