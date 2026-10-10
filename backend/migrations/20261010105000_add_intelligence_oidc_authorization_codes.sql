-- Authorization codes are random, single-use handles. Store only their SHA-256
-- digests so database readers cannot exchange a code copied from this table.
CREATE TABLE public.intelligence_oidc_authorization_codes (
    code_hash bytea PRIMARY KEY,
    client_id text NOT NULL,
    redirect_uri text NOT NULL,
    user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    code_challenge text NOT NULL,
    nonce text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX intelligence_oidc_authorization_codes_expiry
    ON public.intelligence_oidc_authorization_codes(expires_at);
