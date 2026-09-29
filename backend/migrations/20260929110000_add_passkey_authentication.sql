CREATE TABLE passkey_credentials (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id text NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  credential_data jsonb NOT NULL,
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX passkey_credentials_user_family_idx
  ON passkey_credentials(user_id, family_id)
  WHERE revoked_at IS NULL;

CREATE TABLE passkey_ceremonies (
  id_hash text PRIMARY KEY,
  purpose text NOT NULL CHECK (purpose IN ('register', 'authenticate', 'invite-register')),
  family_id text,
  user_id text,
  invite_token_hash text,
  session_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX passkey_ceremonies_expiry_idx ON passkey_ceremonies(expires_at);

CREATE TABLE qr_login_requests (
  request_hash text PRIMARY KEY,
  family_id text,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  approved_user_id text,
  browser_ip text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE INDEX qr_login_requests_expiry_idx ON qr_login_requests(expires_at);
