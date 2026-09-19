/**
 * useLiveCaptions — Real-time AI Speech Recognition and Live Translation Hook.
 *
 * Captures user speech via browser SpeechRecognition API at zero latency,
 * translates to the participant's chosen language via Groq LLM backend, and
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

// Web Speech API interface definitions
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export type UseLiveCaptionsParams = {
  accessToken?: string | null;
  roomId?: string | null;
  guestToken?: string | null;
  displayName?: string;
  room?: Room | null;
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
  defaultLanguage = "en",
}: UseLiveCaptionsParams): UseLiveCaptionsReturn {
  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState(false);
  const [targetLanguage, setTargetLanguageState] = useState(() => {
    return localStorage.getItem("stovo_caption_lang") || defaultLanguage;
  });
  const [currentInterimCaption, setCurrentInterimCaption] = useState<string | null>(null);
  const [recentCaptions, setRecentCaptions] = useState<LiveCaptionItem[]>([]);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isEnabledRef = useRef(isCaptionsEnabled);
  isEnabledRef.current = isCaptionsEnabled;
  const targetLangRef = useRef(targetLanguage);
  targetLangRef.current = targetLanguage;

  const isSpeechRecognitionSupported = typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const setTargetLanguage = useCallback((lang: string) => {
    setTargetLanguageState(lang);
    localStorage.setItem("stovo_caption_lang", lang);
  }, []);

  const toggleCaptions = useCallback(() => {
    setIsCaptionsEnabled((prev) => !prev);
  }, []);

  // Translation dispatch helper
  const translateText = useCallback(async (text: string, lang: string): Promise<string> => {
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
        body: JSON.stringify({ text, targetLang: lang }),
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
          translated?: string;
        };

        if (data.type === "caption" && data.text) {
          let displayedTranslation = data.translated || data.text;
          // If speaker's targetLang differs from our targetLang, translate to our lang
          if (data.targetLang !== targetLangRef.current && data.text) {
            displayedTranslation = await translateText(data.text, targetLangRef.current);
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

  // Speech recognition runner
  useEffect(() => {
    if (!isCaptionsEnabled || !isSpeechRecognitionSupported) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
      setCurrentInterimCaption(null);
      return;
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    let rec: SpeechRecognitionInstance | null = null;
    let isRunning = true;

    const startRecognition = () => {
      if (!isRunning) return;
      try {
        rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = navigator.language || "en-US";

        rec.onresult = async (event: SpeechRecognitionEvent) => {
          let interimText = "";
          let finalText = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcript = result[0]?.transcript ?? "";
            if (result.isFinal) {
              finalText += transcript;
            } else {
              interimText += transcript;
            }
          }

          if (interimText) {
            setCurrentInterimCaption(interimText);
          }

          if (finalText.trim()) {
            setCurrentInterimCaption(null);
            const currentLang = targetLangRef.current;
            const translated = await translateText(finalText, currentLang);

            const captionItem: LiveCaptionItem = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              speakerName: displayName,
              originalText: finalText,
              translatedText: translated,
              targetLang: currentLang,
              timestamp: Date.now(),
            };

            setRecentCaptions((prev) => [...prev.slice(-4), captionItem]);

            // Broadcast over LiveKit room if available
            if (room && room.localParticipant) {
              try {
                const data = new TextEncoder().encode(
                  JSON.stringify({
                    type: "caption",
                    speaker: displayName,
                    text: finalText,
                    translated,
                    targetLang: currentLang,
                  })
                );
                void room.localParticipant.publishData(data, { reliable: true });
              } catch (pubErr) {
                console.warn("[useLiveCaptions] failed to broadcast caption:", pubErr);
              }
            }
          }
        };

        rec.onerror = (errEvent) => {
          console.warn("[useLiveCaptions] speech recognition error:", errEvent);
        };

        rec.onend = () => {
          // Restart if still enabled
          if (isRunning && isEnabledRef.current) {
            setTimeout(startRecognition, 300);
          }
        };

        rec.start();
        recognitionRef.current = rec;
      } catch (err) {
        console.warn("[useLiveCaptions] speech recognition start error:", err);
      }
    };

    startRecognition();

    return () => {
      isRunning = false;
      if (rec) {
        try { rec.stop(); } catch {}
      }
      recognitionRef.current = null;
    };
  }, [isCaptionsEnabled, isSpeechRecognitionSupported, displayName, room, translateText]);

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
