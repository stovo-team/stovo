-- Older runtime Ent schema bootstraps could reduce chat_members to a
-- chat_id-only primary key. A chat must support multiple users, including
-- MCP connector actors, so restore the Atlas-owned composite key.
ALTER TABLE public.chat_members
    DROP CONSTRAINT IF EXISTS chat_members_pkey;

ALTER TABLE public.chat_members
    DROP CONSTRAINT IF EXISTS chatmember_pkey;

ALTER TABLE public.chat_members
    ADD CONSTRAINT chat_members_pkey
    PRIMARY KEY (chat_id, user_id);
