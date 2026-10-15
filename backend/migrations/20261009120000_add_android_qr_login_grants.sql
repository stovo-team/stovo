CREATE TABLE android_qr_login_grants (
  id_hash text PRIMARY KEY,
  family_id text NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX android_qr_login_grants_expiry_idx ON android_qr_login_grants(expires_at);
