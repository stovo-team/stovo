ALTER TABLE public.call_transcription_sessions
    ADD COLUMN IF NOT EXISTS chat_id text;

UPDATE public.call_transcription_sessions AS transcript
SET chat_id = message.chat_id
FROM public.messages AS message
WHERE transcript.chat_id IS NULL
  AND transcript.notes_message_id = message.id;

CREATE INDEX IF NOT EXISTS idx_call_transcription_sessions_chat_id
    ON public.call_transcription_sessions (chat_id);
