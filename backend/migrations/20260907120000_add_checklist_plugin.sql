-- Persistent, chat-linked collaborative checklists (groceries, errands, to-dos).

CREATE TABLE IF NOT EXISTS checklists (
    id text PRIMARY KEY,
    family_id text NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
    origin_chat_id text NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
    created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title text NOT NULL,
    category text NOT NULL DEFAULT 'general',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_checklists_family_active
    ON checklists (family_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS checklist_chat_links (
    checklist_id text NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
    chat_id text NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
    created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    card_message_id text REFERENCES messages(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    PRIMARY KEY (checklist_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_chat_links_chat_active
    ON checklist_chat_links (chat_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS checklist_cards (
    message_id text PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    checklist_id text NOT NULL REFERENCES checklists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checklist_cards_checklist ON checklist_cards (checklist_id);

CREATE TABLE IF NOT EXISTS checklist_items (
    id text PRIMARY KEY,
    checklist_id text NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
    text text NOT NULL,
    completed boolean NOT NULL DEFAULT false,
    position integer NOT NULL DEFAULT 0,
    section text,
    created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    completed_by text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist_pos
    ON checklist_items (checklist_id, position ASC, created_at ASC);
