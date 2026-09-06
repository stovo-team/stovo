-- Repair databases that were bootstrapped by an older Ent schema. That
-- schema could make connector_id the sole primary key, which prevented a
-- connector from being bound to more than one chat. The Atlas-owned schema
-- requires one binding per (connector_id, chat_id) pair.
ALTER TABLE public.mcp_connector_chats
    DROP CONSTRAINT IF EXISTS mcp_connector_chats_pkey;

ALTER TABLE public.mcp_connector_chats
    DROP CONSTRAINT IF EXISTS mcpconnectorchat_pkey;

ALTER TABLE public.mcp_connector_chats
    ADD CONSTRAINT mcp_connector_chats_pkey
    PRIMARY KEY (connector_id, chat_id);
