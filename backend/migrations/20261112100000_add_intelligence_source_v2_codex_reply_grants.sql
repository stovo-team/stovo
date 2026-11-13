ALTER TABLE public.intelligence_source_v2_consent_codes
    ADD COLUMN codex_granted boolean NOT NULL DEFAULT false,
    ADD COLUMN reply_granted boolean NOT NULL DEFAULT false;

ALTER TABLE public.intelligence_browser_authorization_sessions
    ADD COLUMN codex_granted boolean NOT NULL DEFAULT false,
    ADD COLUMN reply_granted boolean NOT NULL DEFAULT false;

ALTER TABLE public.intelligence_source_v2_connection_grants
    DROP CONSTRAINT intelligence_source_v2_connection_grants_grant_type_check,
    ADD CONSTRAINT intelligence_source_v2_connection_grants_grant_type_check
        CHECK (grant_type IN ('read', 'process', 'external_transfer', 'export', 'codex', 'reply'));

INSERT INTO public.intelligence_source_v2_connection_grants(connection_id,grant_type,granted,updated_at)
SELECT c.id,grant_type,false,now()
FROM public.intelligence_source_v2_connections c
CROSS JOIN (VALUES ('codex'),('reply')) AS new_grant(grant_type)
ON CONFLICT (connection_id,grant_type) DO NOTHING;

ALTER TABLE public.intelligence_source_v2_audit
    DROP CONSTRAINT intelligence_source_v2_audit_grant_type_check,
    ADD CONSTRAINT intelligence_source_v2_audit_grant_type_check
        CHECK (grant_type IS NULL OR grant_type IN ('read', 'process', 'external_transfer', 'export', 'codex', 'reply'));

CREATE TABLE public.intelligence_source_v2_reply_origins (
    connection_id text NOT NULL REFERENCES public.intelligence_source_v2_connections(id) ON DELETE CASCADE,
    operation_id text NOT NULL,
    message_id text NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    origin text NOT NULL CHECK (origin = 'local_codex_bridge'),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    content_hash bytea NOT NULL CHECK (octet_length(content_hash) = 32),
    final boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (connection_id, operation_id),
    UNIQUE (message_id)
);
