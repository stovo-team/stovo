-- Keep the Atlas-owned PostgreSQL schema aligned with the Ent chat model.
-- Existing chats default to immediate delivery, preserving current behavior.
ALTER TABLE public.chats
    ADD COLUMN IF NOT EXISTS message_delay_seconds integer NOT NULL DEFAULT 0;

-- The identity model exposes these optional profile fields.  They were added
-- to Ent without a corresponding Atlas migration, which made every setup
-- request fail when it loaded its newly-created user.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS email text,
    ADD COLUMN IF NOT EXISTS bio text,
    ADD COLUMN IF NOT EXISTS timezone text;
