-- Direct-media groundwork. Existing attachments remain ready and continue to
-- use the legacy upload/download endpoints until the reservation API ships.
ALTER TABLE files
    ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'ready',
    ADD COLUMN IF NOT EXISTS object_revision text,
    ADD COLUMN IF NOT EXISTS object_etag text,
    ADD COLUMN IF NOT EXISTS detected_mime_type text,
    ADD COLUMN IF NOT EXISTS preview_revision text,
    ADD COLUMN IF NOT EXISTS preview_status text NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS validation_failure_code text,
    ADD COLUMN IF NOT EXISTS validated_at text;

CREATE TABLE IF NOT EXISTS file_uploads (
    id text PRIMARY KEY,
    file_id text NOT NULL UNIQUE REFERENCES files(id),
    family_id text NOT NULL REFERENCES families(id),
    uploaded_by text NOT NULL REFERENCES users(id),
    chat_id text REFERENCES chats(id),
    access_scope text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    upload_mode text NOT NULL,
    multipart_upload_id text,
    object_key text NOT NULL,
    expected_mime_type text NOT NULL,
    expected_size_bytes bigint NOT NULL,
    expected_checksum text,
    state text NOT NULL DEFAULT 'reserved',
    failure_code text,
    expires_at text NOT NULL,
    completed_at text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    CONSTRAINT uq_file_uploads_request UNIQUE (uploaded_by, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_file_uploads_state_expires_at ON file_uploads (state, expires_at);
