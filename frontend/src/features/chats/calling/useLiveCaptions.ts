/**
 * useLiveCaptions — Real-time AI Speech Recognition and Live Translation Hook.
 *
 * Captures the active call microphone stream, transcribes it with automatic
 * language detection, translates to the participant's chosen language, and
 * distributes subtitles to call participants.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { RoomEvent } from "livekit-client";
import { getApiUrl } from "../../../api/client";

export type LiveCaptionItem = {
  id: string;
  speakerName: string;
  originalText: string;
  translatedText: string;
  targetLang: string;
  timestamp: number;
};

export type UseLiveCaptionsParams = {
  accessToken?: string | null;
  roomId?: string | null;
  guestToken?: string | null;
  displayName?: string;
  room?: Room | null;
  localAudioStream?: MediaStream | null;
  defaultLanguage?: string;
};

export type UseLiveCaptionsReturn = {
  isCaptionsEnabled: boolean;
  toggleCaptions: () => void;
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
  currentInterimCaption: string | null;
  recentCaptions: LiveCaptionItem[];
  isSpeechRecognitionSupported: boolean;
};

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish (Español)" },
  { code: "ru", label: "Russian (Русский)" },
  { code: "de", label: "German (Deutsch)" },
  { code: "fr", label: "French (Français)" },
  { code: "zh", label: "Chinese (中文)" },
  { code: "ja", label: "Japanese (日本語)" },
  { code: "ko", label: "Korean (한국어)" },
  { code: "it", label: "Italian (Italiano)" },
  { code: "pt", label: "Portuguese (Português)" },
  { code: "tr", label: "Turkish (Türkçe)" },
  { code: "ar", label: "Arabic (العربية)" },
  { code: "ky", label: "Kyrgyz (Кыргызча)" },
  { code: "kk", label: "Kazakh (Қазақша)" },
  { code: "uz", label: "Uzbek (O'zbek)" },
];

export function useLiveCaptions({
  accessToken,
  roomId,
  guestToken,
  displayName = "You",
  room,
  localAudioStream,
  defaultLanguage = "en",
}: UseLiveCaptionsParams): UseLiveCaptionsReturn {
  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState(false);
  const [targetLanguage, setTargetLanguageState] = useState(() => {
    return localStorage.getItem("stovo_caption_lang") || defaultLanguage;
  });
  const [currentInterimCaption, setCurrentInterimCaption] = useState<string | null>(null);
  const [recentCaptions, setRecentCaptions] = useState<LiveCaptionItem[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const targetLangRef = useRef(targetLanguage);
  targetLangRef.current = targetLanguage;

  const isSpeechRecognitionSupported = typeof window !== "undefined" && typeof MediaRecorder !== "undefined";

  const setTargetLanguage = useCallback((lang: string) => {
    setTargetLanguageState(lang);
    localStorage.setItem("stovo_caption_lang", lang);
  }, []);

  const toggleCaptions = useCallback(() => {
    setIsCaptionsEnabled((prev) => !prev);
  }, []);

  // Translation dispatch helper
  const translateText = useCallback(async (text: string, lang: string, sourceLang = ""): Promise<string> => {
    if (!text.trim()) return "";
    try {
      const endpoint = guestToken
        ? `${getApiUrl()}/api/guest-meetings/public/${guestToken}/captions/translate`
        : roomId
        ? `${getApiUrl()}/api/calls/${roomId}/captions/translate`
        : null;

      if (!endpoint) return text;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, sourceLang, targetLang: lang }),
      });

      if (!res.ok) return text;
      const data = (await res.json()) as { translatedText?: string };
      return data.translatedText || text;
    } catch {
      return text;
    }
  }, [accessToken, roomId, guestToken]);

  // Handle incoming livekit data broadcast
  useEffect(() => {
    if (!room || !isCaptionsEnabled) return;

    const onDataReceived = async (payload: Uint8Array) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text) as {
          type?: string;
          speaker?: string;
          text?: string;
          targetLang?: string;
          sourceLang?: string;
          translated?: string;
        };

        if (data.type === "caption" && data.text) {
          let displayedTranslation = data.translated || data.text;
          // If speaker's targetLang differs from our targetLang, translate to our lang
          if (data.targetLang !== targetLangRef.current && data.text) {
            displayedTranslation = await translateText(data.text, targetLangRef.current, data.sourceLang || "");
          }

          const item: LiveCaptionItem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            speakerName: data.speaker || "Participant",
            originalText: data.text,
            translatedText: displayedTranslation,
            targetLang: targetLangRef.current,
            timestamp: Date.now(),
          };

          setRecentCaptions((prev) => [...prev.slice(-4), item]);
        }
      } catch {
        // ignore invalid packets
      }
    };

    room.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [room, isCaptionsEnabled, translateText]);

  // Audio capture and server-side speech recognition. The server leaves the
  // source language unspecified so Qwen ASR detects it from the voice.
  useEffect(() => {
    if (!isCaptionsEnabled || !isSpeechRecognitionSupported) {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try { recorderRef.current.stop(); } catch {}
      }
      recorderRef.current = null;
      setCurrentInterimCaption(null);
      return;
    }

    const audioTracks = localAudioStream?.getAudioTracks().filter((track) => track.readyState === "live") ?? [];
    if (audioTracks.length === 0) {
      setCurrentInterimCaption(null);
      return;
    }

    let isActive = true;
    let uploadQueue = Promise.resolve();
    let recorder: MediaRecorder | null = null;
    const abortController = new AbortController();

    const sendAudioChunk = async (chunk: Blob, filename: string) => {
      if (chunk.size === 0) return;
      const endpoint = guestToken
        ? `${getApiUrl()}/api/guest-meetings/public/${guestToken}/captions/transcribe`
        : roomId
        ? `${getApiUrl()}/api/calls/${roomId}/captions/transcribe`
        : null;
      if (!endpoint) return;

      const body = new FormData();
      body.append("audio", chunk, filename);
      body.append("targetLang", targetLangRef.current);
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body,
          signal: abortController.signal,
        });
        if (!response.ok) return;
        const result = await response.json() as {
          text?: string;
          sourceLang?: string;
          translatedText?: string;
          targetLang?: string;
        };
        if (!isActive || !result.text?.trim()) return;
        const originalText = result.text.trim();
        const sourceLang = result.sourceLang || "";
        const currentLang = result.targetLang || targetLangRef.current;
        const translated = result.translatedText || originalText;
        const timestamp = Date.now();
        const captionItem: LiveCaptionItem = {
          id: `${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
          speakerName: displayName,
          originalText,
          translatedText: translated,
          targetLang: currentLang,
          timestamp,
        };
        setRecentCaptions((prev) => [...prev.slice(-4), captionItem]);

        if (room?.localParticipant) {
          const data = new TextEncoder().encode(JSON.stringify({
            type: "caption",
            speaker: displayName,
            text: originalText,
            sourceLang,
            translated,
            targetLang: currentLang,
          }));
          void room.localParticipant.publishData(data, { reliable: true });
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[useLiveCaptions] caption audio request failed:", error);
        }
      }
    };

    let recordingInterval: number | undefined;
    try {
      const audioStream = new MediaStream(audioTracks);
      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
      const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
      const actualMimeType = recorder.mimeType || mimeType || "audio/webm";
      const extension = actualMimeType.includes("mp4") ? "mp4" : actualMimeType.includes("ogg") ? "ogg" : "webm";
      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;
        uploadQueue = uploadQueue
          .then(() => sendAudioChunk(event.data, `caption.${extension}`))
          .catch((error: unknown) => console.warn("[useLiveCaptions] failed to process audio chunk:", error));
      };
      recorder.onstop = () => {
        // Separate stop/start cycles produce independent media files; a
        // timeslice fragment is not guaranteed to contain a WebM/MP4 header.
        if (isActive && recorder?.state === "inactive") recorder.start();
      };
      recorder.onerror = (event) => console.warn("[useLiveCaptions] audio capture error:", event);
      recorder.start();
      recordingInterval = window.setInterval(() => {
        if (isActive && recorder?.state === "recording") recorder.stop();
      }, 5000);
      recorderRef.current = recorder;
    } catch (error) {
      console.warn("[useLiveCaptions] audio capture could not start:", error);
    }

    return () => {
      isActive = false;
      if (recordingInterval !== undefined) window.clearInterval(recordingInterval);
      if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch {}
      }
      // Let the final dataavailable event flush after stop; cancel requests
      // once queued chunks finish (or fail).
      void uploadQueue.finally(() => abortController.abort());
      recorderRef.current = null;
    };
  }, [isCaptionsEnabled, isSpeechRecognitionSupported, displayName, room, localAudioStream, accessToken, roomId, guestToken]);

  // Clean old captions after 8 seconds
  useEffect(() => {
    if (recentCaptions.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setRecentCaptions((prev) => prev.filter((c) => now - c.timestamp < 8000));
    }, 2000);
    return () => clearInterval(timer);
  }, [recentCaptions.length]);

  return {
    isCaptionsEnabled,
    toggleCaptions,
    targetLanguage,
    setTargetLanguage,
    currentInterimCaption,
    recentCaptions,
    isSpeechRecognitionSupported,
  };
}
