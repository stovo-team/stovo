-- Add call recordings table for universal meeting recording

CREATE TABLE public.call_recordings (
    id text NOT NULL,
    call_id text NOT NULL,
    chat_id text NOT NULL,
    initiated_by text NOT NULL,
    status text NOT NULL DEFAULT 'recording',
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    stopped_at timestamp with time zone,
    completed_at timestamp with time zone,
    duration_ms bigint NOT NULL DEFAULT 0,
    size_bytes bigint NOT NULL DEFAULT 0,
    mime_type text NOT NULL DEFAULT 'video/webm',
    object_key text,
    file_id text,
    message_id text,
    call_history_message_id text,
    failure_message text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT call_recordings_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_call_recordings_call_id ON public.call_recordings (call_id);
CREATE INDEX idx_call_recordings_chat_id ON public.call_recordings (chat_id);
CREATE INDEX idx_call_recordings_status ON public.call_recordings (status);
CREATE UNIQUE INDEX idx_call_recordings_call_id_active
    ON public.call_recordings (call_id)
    WHERE status IN ('recording', 'processing');
