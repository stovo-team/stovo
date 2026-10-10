-- Keep the provider's opaque identity independent from Messenger profile data.
-- The same subject may exist at another issuer, but an issuer subject can map
-- to only one local user.
CREATE TABLE public.intelligence_oidc_subjects (
    issuer text NOT NULL,
    user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    subject text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (issuer, user_id),
    UNIQUE (issuer, subject)
);
