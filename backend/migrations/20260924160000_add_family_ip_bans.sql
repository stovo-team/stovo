CREATE TABLE family_ip_bans (
    family_id text NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    ip_address inet NOT NULL,
    target_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (family_id, ip_address),
    UNIQUE (family_id, target_user_id)
);
