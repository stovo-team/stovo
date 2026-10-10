-- Browser flows use a short-lived, one-use ticket because a top-level OAuth
-- redirect or native form post cannot carry the Messenger bearer held by the
-- SPA. The browser receives only the ticket as a path-scoped HttpOnly cookie;
-- the database retains its SHA-256 digest and the immutable request binding.
CREATE TABLE public.intelligence_browser_authorization_sessions (
    ticket_hash bytea PRIMARY KEY CHECK (octet_length(ticket_hash) = 32),
    flow text NOT NULL CHECK (flow IN ('oidc', 'source_v2')),
    user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    family_id text NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    client_id text NOT NULL,
    redirect_uri text NOT NULL,
    state text NOT NULL,
    code_challenge text NOT NULL,
    code_challenge_method text NOT NULL CHECK (code_challenge_method = 'S256'),
    nonce text,
    chat_id text REFERENCES public.chats(id) ON DELETE CASCADE,
    read_granted boolean NOT NULL DEFAULT false,
    process_granted boolean NOT NULL DEFAULT false,
    external_transfer_granted boolean NOT NULL DEFAULT false,
    export_granted boolean NOT NULL DEFAULT false,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((flow = 'oidc' AND nonce IS NOT NULL AND chat_id IS NULL)
        OR (flow = 'source_v2' AND nonce IS NULL AND chat_id IS NOT NULL))
);

CREATE INDEX intelligence_browser_authorization_sessions_expiry
    ON public.intelligence_browser_authorization_sessions(expires_at);
