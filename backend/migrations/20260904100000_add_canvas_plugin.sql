-- Persistent, chat-linked collaborative canvases. Canvas document updates are
-- encrypted by the application before they are written to canvas_updates.

CREATE TABLE canvases (
    id text PRIMARY KEY,
    family_id text NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
    origin_chat_id text NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
    created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX idx_canvases_family_active
    ON canvases (family_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE canvas_chat_links (
    canvas_id text NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    chat_id text NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
    created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    card_message_id text REFERENCES messages(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    PRIMARY KEY (canvas_id, chat_id)
);

CREATE INDEX idx_canvas_chat_links_chat_active
    ON canvas_chat_links (chat_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE canvas_cards (
    message_id text PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    canvas_id text NOT NULL REFERENCES canvases(id) ON DELETE CASCADE
);

CREATE INDEX idx_canvas_cards_canvas ON canvas_cards (canvas_id);

CREATE TABLE canvas_updates (
    canvas_id text NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    sequence bigint GENERATED ALWAYS AS IDENTITY,
    ciphertext text NOT NULL,
    nonce text NOT NULL,
    created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (canvas_id, sequence)
);

CREATE INDEX idx_canvas_updates_canvas_sequence
    ON canvas_updates (canvas_id, sequence);
