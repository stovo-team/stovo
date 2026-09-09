CREATE TABLE guest_meetings (
  id text PRIMARY KEY,
  chat_id text NOT NULL REFERENCES chats(id),
  creator_id text NOT NULL REFERENCES users(id),
  token_hash text NOT NULL UNIQUE,
  admission_mode text NOT NULL CHECK (admission_mode IN ('immediate', 'lobby')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  ended_at timestamptz
);
CREATE INDEX guest_meetings_creator_id_idx ON guest_meetings(creator_id);
CREATE INDEX guest_meetings_chat_id_idx ON guest_meetings(chat_id);

CREATE TABLE guest_meeting_sessions (
  id text PRIMARY KEY,
  meeting_id text NOT NULL REFERENCES guest_meetings(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE,
  display_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('waiting', 'admitted', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  admitted_at timestamptz,
  blocked_at timestamptz
);
CREATE INDEX guest_meeting_sessions_meeting_id_idx ON guest_meeting_sessions(meeting_id);
