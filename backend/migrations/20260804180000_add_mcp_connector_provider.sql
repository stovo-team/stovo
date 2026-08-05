-- Persist which MCP client the connector was created for (setup instructions + list display).

ALTER TABLE public.mcp_connectors
    ADD COLUMN provider text DEFAULT 'claude_code'::text NOT NULL;
