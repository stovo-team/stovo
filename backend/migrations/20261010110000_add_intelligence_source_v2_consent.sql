-- Source v2 is kept in its own tables so its credentials and lifecycle events
-- cannot enter the existing v1 authentication or materialization triggers.
CREATE TABLE public.intelligence_source_v2_connections (
    id text PRIMARY KEY,
    installation_id text NOT NULL REFERENCES public.intelligence_installations(id) ON DELETE CASCADE,
    principal_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    credential_hash bytea NOT NULL UNIQUE CHECK (octet_length(credential_hash) = 32),
    enabled boolean NOT NULL DEFAULT false,
    next_sequence bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    credential_expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);

CREATE TABLE public.intelligence_source_v2_connection_chats (
    connection_id text PRIMARY KEY REFERENCES public.intelligence_source_v2_connections(id) ON DELETE CASCADE,
    chat_id text NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE
);

CREATE INDEX intelligence_source_v2_connections_active
    ON public.intelligence_source_v2_connections(installation_id, principal_user_id)
    WHERE enabled AND revoked_at IS NULL;

CREATE TABLE public.intelligence_source_v2_consent_codes (
    code_hash bytea PRIMARY KEY CHECK (octet_length(code_hash) = 32),
    client_id text NOT NULL,
    redirect_uri text NOT NULL,
    installation_id text NOT NULL REFERENCES public.intelligence_installations(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    family_id text NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    chat_id text NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    code_challenge text NOT NULL,
    read_granted boolean NOT NULL DEFAULT false,
    process_granted boolean NOT NULL DEFAULT false,
    external_transfer_granted boolean NOT NULL DEFAULT false,
    export_granted boolean NOT NULL DEFAULT false,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_source_v2_consent_codes_expiry
    ON public.intelligence_source_v2_consent_codes(expires_at);

CREATE TABLE public.intelligence_source_v2_connection_grants (
    connection_id text NOT NULL REFERENCES public.intelligence_source_v2_connections(id) ON DELETE CASCADE,
    grant_type text NOT NULL CHECK (grant_type IN ('read', 'process', 'external_transfer', 'export')),
    granted boolean NOT NULL DEFAULT false,
    granted_at timestamptz,
    revoked_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (connection_id, grant_type)
);

CREATE INDEX intelligence_source_v2_connection_grants_current
    ON public.intelligence_source_v2_connection_grants(connection_id, grant_type)
    WHERE granted;

CREATE TABLE public.intelligence_source_v2_audit (
    id text PRIMARY KEY,
    installation_id text,
    connection_id text,
    principal_user_id text,
    operation text NOT NULL,
    result text NOT NULL,
    grant_type text CHECK (grant_type IS NULL OR grant_type IN ('read', 'process', 'external_transfer', 'export')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_source_v2_audit_connection
    ON public.intelligence_source_v2_audit(connection_id, created_at DESC)
    WHERE connection_id IS NOT NULL;
