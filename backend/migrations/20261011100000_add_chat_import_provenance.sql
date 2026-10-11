CREATE TABLE chat_import_batches (
    id text PRIMARY KEY,
    family_id text NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    imported_by text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    chat_id text NOT NULL UNIQUE REFERENCES chats(id) ON DELETE CASCADE,
    source_provider text NOT NULL,
    source_profile text NOT NULL,
    source_conversation_id text,
    created_at text NOT NULL,
    CONSTRAINT chat_import_batches_actor_key_unique UNIQUE (imported_by, idempotency_key)
);

CREATE TABLE message_import_attributions (
    message_id text PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    import_batch_id text NOT NULL REFERENCES chat_import_batches(id) ON DELETE CASCADE,
    source_message_id text NOT NULL,
    source_author_id text NOT NULL,
    source_author_name text NOT NULL,
    source_reactions jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_deleted_at text,
    CONSTRAINT message_import_attributions_source_unique UNIQUE (import_batch_id, source_message_id)
);

CREATE INDEX idx_message_import_attributions_batch ON message_import_attributions (import_batch_id);
