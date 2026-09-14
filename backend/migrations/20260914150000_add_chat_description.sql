-- Keep the Atlas-owned PostgreSQL schema aligned with the Ent chat model.
-- Allow chats to have an optional description.
ALTER TABLE public.chats
    ADD COLUMN IF NOT EXISTS description text;
