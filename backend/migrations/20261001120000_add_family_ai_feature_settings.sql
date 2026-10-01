ALTER TABLE public.families
    ADD COLUMN IF NOT EXISTS translation_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS call_recording_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS ai_notes_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS voice_transcription_enabled boolean NOT NULL DEFAULT true;
