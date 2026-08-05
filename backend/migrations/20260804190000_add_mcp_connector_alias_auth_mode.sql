-- Agent mention alias (@claude / @codex) and auth mode (subscription | api).

ALTER TABLE public.mcp_connectors
    ADD COLUMN alias text DEFAULT ''::text NOT NULL;

ALTER TABLE public.mcp_connectors
    ADD COLUMN auth_mode text DEFAULT 'subscription'::text NOT NULL;

UPDATE public.mcp_connectors
SET alias = CASE provider
    WHEN 'codex' THEN 'codex'
    WHEN 'openclaw' THEN 'openclaw'
    WHEN 'hermes' THEN 'hermes'
    ELSE 'claude'
END
WHERE alias = '';
