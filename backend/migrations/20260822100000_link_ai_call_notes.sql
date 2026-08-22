-- Keep the generated AI notes tied to the call-history message that represents
-- the call in chat. notes_publishing acts as a durable claim so concurrent
-- completion paths cannot post the same notes twice.
ALTER TABLE public.call_transcription_sessions
    ADD COLUMN chat_id text,
    ADD COLUMN call_history_message_id text,
    ADD COLUMN notes_message_id text,
    ADD COLUMN notes_publishing boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX idx_call_transcription_sessions_notes_message_id
    ON public.call_transcription_sessions (notes_message_id)
    WHERE notes_message_id IS NOT NULL;
