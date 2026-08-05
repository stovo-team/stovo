-- Add shared MCP connector tables for Claude Code / agent integrations.

CREATE TABLE public.mcp_connectors (
    id text NOT NULL,
    family_id text NOT NULL,
    name text NOT NULL,
    actor_user_id text NOT NULL,
    token_hash text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    revoked_at text,
    created_by text NOT NULL,
    created_at text NOT NULL,
    last_used_at text,
    max_history_messages integer DEFAULT 50 NOT NULL,
    permissions text DEFAULT '{}'::text NOT NULL
);

CREATE TABLE public.mcp_connector_chats (
    connector_id text NOT NULL,
    chat_id text NOT NULL
);

CREATE TABLE public.mcp_audit_events (
    id text NOT NULL,
    family_id text NOT NULL,
    connector_id text NOT NULL,
    actor_user_id text NOT NULL,
    action text NOT NULL,
    chat_id text,
    message_id text,
    success boolean NOT NULL,
    error text,
    meta text DEFAULT '{}'::text NOT NULL,
    created_at text NOT NULL
);

ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_actor_user_id_key UNIQUE (actor_user_id);
ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.mcp_connector_chats
    ADD CONSTRAINT mcp_connector_chats_pkey PRIMARY KEY (connector_id, chat_id);
ALTER TABLE ONLY public.mcp_audit_events
    ADD CONSTRAINT mcp_audit_events_pkey PRIMARY KEY (id);

CREATE INDEX idx_mcp_audit_connector_created ON public.mcp_audit_events USING btree (connector_id, created_at DESC);

ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id);
ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.mcp_connectors
    ADD CONSTRAINT mcp_connectors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE ONLY public.mcp_connector_chats
    ADD CONSTRAINT mcp_connector_chats_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES public.mcp_connectors(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.mcp_connector_chats
    ADD CONSTRAINT mcp_connector_chats_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.mcp_audit_events
    ADD CONSTRAINT mcp_audit_events_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id);
ALTER TABLE ONLY public.mcp_audit_events
    ADD CONSTRAINT mcp_audit_events_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES public.mcp_connectors(id) ON DELETE CASCADE;
