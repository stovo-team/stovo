-- Flat, family-scoped collections. Files remain in their existing object
-- storage locations; collection membership only changes discoverability and
-- authorization.
CREATE TABLE IF NOT EXISTS storage_collections (
    id text PRIMARY KEY,
    family_id text NOT NULL REFERENCES families(id),
    owner_id text NOT NULL REFERENCES users(id),
    title text NOT NULL,
    display_kind text NOT NULL DEFAULT 'folder',
    content_type text NOT NULL DEFAULT 'mixed',
    cover_file_id text REFERENCES files(id) ON DELETE SET NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    deleted_at text
);

CREATE INDEX IF NOT EXISTS idx_storage_collections_family_active
    ON storage_collections (family_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS storage_collection_items (
    collection_id text NOT NULL REFERENCES storage_collections(id) ON DELETE CASCADE,
    file_id text NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    added_by text NOT NULL REFERENCES users(id),
    created_at text NOT NULL,
    PRIMARY KEY (collection_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_storage_collection_items_file
    ON storage_collection_items (file_id);

CREATE TABLE IF NOT EXISTS storage_collection_grants (
    collection_id text NOT NULL REFERENCES storage_collections(id) ON DELETE CASCADE,
    principal_type text NOT NULL,
    principal_id text NOT NULL,
    access_level text NOT NULL DEFAULT 'viewer',
    created_at text NOT NULL,
    updated_at text NOT NULL,
    PRIMARY KEY (collection_id, principal_type, principal_id),
    CHECK (principal_type IN ('user', 'role')),
    CHECK (access_level IN ('viewer', 'editor'))
);

CREATE TABLE IF NOT EXISTS message_collection_cards (
    message_id text PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    collection_id text NOT NULL REFERENCES storage_collections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_collection_cards_collection
    ON message_collection_cards (collection_id);
