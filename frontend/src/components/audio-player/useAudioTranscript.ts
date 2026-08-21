import { useCallback, useEffect, useState } from "react";

import { getFileTranscript, transcribeFile } from "../../api/files";

export function useAudioTranscript(accessToken: string | null | undefined, fileId: string) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(true);

  useEffect(() => {
    if (!accessToken || !fileId || fileId.startsWith("local:")) return;
    let cancelled = false;
    getFileTranscript(accessToken, fileId).then((res) => {
      if (!cancelled && res?.text) setTranscript(res.text);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [accessToken, fileId]);

  const transcribe = useCallback(async () => {
    if (!accessToken || isTranscribing || !fileId || fileId.startsWith("local:")) return;
    setIsTranscribing(true);
    setTranscriptError(null);
    try {
      const res = await transcribeFile(accessToken, fileId);
      if (res?.text) {
        setTranscript(res.text);
        setIsTranscriptExpanded(true);
      } else setTranscriptError("No speech detected in audio.");
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : "Transcription failed.");
    } finally { setIsTranscribing(false); }
  }, [accessToken, fileId, isTranscribing]);

  return { transcript, isTranscribing, transcriptError, isTranscriptExpanded, setIsTranscriptExpanded, transcribe };
}
