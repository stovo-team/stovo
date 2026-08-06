-- Add AI call transcription tables

CREATE TABLE public.call_transcription_sessions (
    id text NOT NULL,
    call_id text NOT NULL,
    initiated_by text NOT NULL,

    status text NOT NULL,
    provider text NOT NULL DEFAULT 'groq',
    provider_model text NOT NULL DEFAULT 'whisper-large-v3-turbo',

    started_at timestamp with time zone,
    stopped_at timestamp with time zone,
    completed_at timestamp with time zone,

    submitted_audio_ms bigint NOT NULL DEFAULT 0,
    estimated_cost_usd numeric(12,6),

    detected_languages jsonb NOT NULL DEFAULT '[]'::jsonb,
    failure_code text,
    failure_message text,

    artifact_exact_key text,
    artifact_cleaned_key text,
    artifact_vtt_key text,
    artifact_summary_key text,
    summary_json jsonb,

    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT call_transcription_sessions_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX idx_call_transcription_sessions_call_id_active
    ON public.call_transcription_sessions (call_id)
    WHERE status IN ('starting', 'recording', 'stopping', 'queued', 'validating_audio', 'transcribing', 'postprocessing');

CREATE INDEX idx_call_transcription_sessions_call_id ON public.call_transcription_sessions (call_id);
CREATE INDEX idx_call_transcription_sessions_status ON public.call_transcription_sessions (status);

CREATE TABLE public.call_audio_chunks (
    id text NOT NULL,
    session_id text NOT NULL,
    participant_id text NOT NULL,

    sequence_number integer NOT NULL,
    object_key text NOT NULL,
    container text NOT NULL,
    codec text NOT NULL,

    call_start_ms bigint NOT NULL,
    call_end_ms bigint NOT NULL,
    duration_ms bigint NOT NULL,

    object_size_bytes bigint,
    checksum_sha256 text,

    client_vad_score real,
    server_vad_status text,
    upload_status text NOT NULL DEFAULT 'pending',

    created_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT call_audio_chunks_pkey PRIMARY KEY (id),
    CONSTRAINT call_audio_chunks_session_participant_seq UNIQUE (session_id, participant_id, sequence_number)
);

CREATE INDEX idx_call_audio_chunks_session_id ON public.call_audio_chunks (session_id);
CREATE INDEX idx_call_audio_chunks_participant_id ON public.call_audio_chunks (participant_id);

CREATE TABLE public.call_transcript_segments (
    id text NOT NULL,
    call_id text NOT NULL,
    session_id text NOT NULL,
    participant_id text NOT NULL,

    start_ms bigint NOT NULL,
    end_ms bigint NOT NULL,

    exact_text text NOT NULL,
    cleaned_text text,

    detected_language text,
    confidence real,

    package_id text,
    provider_segment_index integer,

    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT call_transcript_segments_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_call_transcript_segments_session_start ON public.call_transcript_segments (session_id, start_ms);
CREATE INDEX idx_call_transcript_segments_call_start ON public.call_transcript_segments (call_id, start_ms);
CREATE INDEX idx_call_transcript_segments_participant ON public.call_transcript_segments (participant_id, start_ms);
CREATE INDEX idx_call_transcript_segments_fts ON public.call_transcript_segments USING gin(to_tsvector('simple', exact_text));

CREATE TABLE public.call_transcription_packages (
    id text NOT NULL,
    session_id text NOT NULL,
    participant_id text NOT NULL,
    object_key text,
    duration_ms bigint NOT NULL DEFAULT 0,
    regions jsonb NOT NULL DEFAULT '[]'::jsonb,
    provider_response jsonb,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT call_transcription_packages_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_call_transcription_packages_session_id ON public.call_transcription_packages (session_id);
