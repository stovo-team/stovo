/**
 * useTranscription — AI call transcription state and actions.
 *
 * Manages the lifecycle of an AI transcription session attached to an active
 * call. The hook is intentionally self-contained: it owns its own state and
 * communicates with the backend via fetch + the existing socketRef.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

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
  container: "webm" | "ogg";
  callStartMs: number;
  callEndMs: number;
  durationMs: number;
  blob: Blob;
};

/** Request a presigned URL and upload a single audio chunk to MinIO. */
export async function uploadAudioChunk(params: AudioChunkUploadParams): Promise<void> {
  // 1. Request presigned URL from backend.
  const urlResponse = await fetch(`/api/calls/${params.roomId}/transcription/uploads`, {
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
    }),
  });
  if (!urlResponse.ok) {
    throw new Error(`Failed to get upload URL: ${urlResponse.status}`);
  }
  const { chunkId, uploadUrl } = (await urlResponse.json()) as {
    chunkId: string;
    uploadUrl: string;
    objectKey: string;
    expiresAt: string;
  };

  // 2. Upload directly to MinIO.
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": params.container === "ogg" ? "audio/ogg" : "audio/webm" },
    body: params.blob,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Audio upload failed: ${uploadResponse.status}`);
  }

  // 3. Confirm completion to backend.
  await fetch(`/api/calls/${params.roomId}/transcription/uploads/${chunkId}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({ checksum: "", sizeBytes: params.blob.size }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export type UseTranscriptionParams = {
  accessToken: string | null;
  roomId: string | null;
  currentUserId: string | null;
  socketRef?: React.RefObject<Socket | null>;
  localVideoStream?: MediaStream | null;
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
  localVideoStream,
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

  // ── Audio Recorder Effect ────────────────────────────────────────────────
  useEffect(() => {
    if (transcriptState !== "recording" || !accessToken || !roomId || !currentUserId || !transcriptSessionId) {
      return;
    }

    let recorder: MediaRecorder | null = null;
    let sequence = 0;
    const recordingStartMs = Date.now();
    let lastChunkEndMs = 0;
    let activeStream: MediaStream | null = null;
    let stopStreamOnCleanup = false;

    const startRecording = async () => {
      try {
        let stream: MediaStream;
        if (localVideoStream && localVideoStream.getAudioTracks().length > 0) {
          stream = new MediaStream(localVideoStream.getAudioTracks());
        } else {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stopStreamOnCleanup = true;
        }
        activeStream = stream;

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/ogg";

        const container: "webm" | "ogg" = mimeType.includes("ogg") ? "ogg" : "webm";

        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
        recorder.ondataavailable = async (e: BlobEvent) => {
          if (e.data && e.data.size > 0) {
            const seq = sequence++;
            const callStartMs = lastChunkEndMs;
            const nowOffsetMs = Date.now() - recordingStartMs;
            const durationMs = Math.max(1000, nowOffsetMs - callStartMs);
            lastChunkEndMs = nowOffsetMs;

            try {
              await uploadAudioChunk({
                accessToken,
                roomId,
                sessionId: transcriptSessionId,
                participantId: currentUserId,
                sequence: seq,
                container,
                callStartMs,
                callEndMs: nowOffsetMs,
                durationMs,
                blob: e.data,
              });
            } catch (uploadErr) {
              console.warn("[useTranscription] chunk upload failed seq=", seq, uploadErr);
            }
          }
        };

        // Slice audio into 5-second chunks
        recorder.start(5000);
      } catch (err) {
        console.error("[useTranscription] MediaRecorder init failed:", err);
      }
    };

    void startRecording();

    return () => {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      if (stopStreamOnCleanup && activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [transcriptState, accessToken, roomId, currentUserId, transcriptSessionId, localVideoStream]);

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

    const onFailed = (payload: { sessionId: string; status: string }) => {
      if (
        sessionIdRef.current === payload.sessionId ||
        payload.status === "failed"
      ) {
        setTranscriptState("failed");
        setTranscriptError("Transcription failed. Please try again.");
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
    setTranscriptState("starting");
    setTranscriptError(null);
    try {
      const response = await fetch(`/api/calls/${roomId}/transcription/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({ detail: "Failed to start transcription" }))) as {
          detail?: string;
        };
        throw new Error(err.detail ?? "Failed to start transcription");
      }
      const data = (await response.json()) as { id: string; status: string };
      setTranscriptSessionId(data.id);
      setTranscriptState("recording");
    } catch (err) {
      console.error("[useTranscription] start failed:", err);
      setTranscriptState("failed");
      setTranscriptError(err instanceof Error ? err.message : "Failed to start transcription");
    }
  }, [accessToken, roomId, enabled]);

  const stopTranscription = useCallback(async () => {
    if (!accessToken || !roomId || !sessionIdRef.current) return;
    setTranscriptState("stopping");
    try {
      const response = await fetch(`/api/calls/${roomId}/transcription/stop`, {
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
    }
  }, [accessToken, roomId]);

  const fetchTranscript = useCallback(async () => {
    if (!accessToken || !roomId) return;
    try {
      const response = await fetch(`/api/calls/${roomId}/transcript`, {
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

  const toggleTranscriptPanel = useCallback(() => {
    setIsTranscriptPanelOpen((v) => !v);
    if (!isTranscriptPanelOpen && transcriptState === "ready" && !transcriptData) {
      void fetchTranscript();
    }
  }, [isTranscriptPanelOpen, transcriptState, transcriptData, fetchTranscript]);

  const resetTranscription = useCallback(() => {
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
