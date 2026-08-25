package app

// schemaStatements contains the CREATE TABLE / CREATE INDEX DDL statements
// that establish the base schema. Each statement is idempotent (IF NOT EXISTS).
var schemaStatements = []string{
	`CREATE TABLE IF NOT EXISTS families (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		storage_limit_mb INTEGER,
		minimized_chat_layout BOOLEAN NOT NULL DEFAULT FALSE,
		default_message_encryption_protocol TEXT NOT NULL DEFAULT 'server_at_rest',
		default_profile_visibility TEXT NOT NULL DEFAULT 'everyone',
		default_last_seen_visibility TEXT NOT NULL DEFAULT 'everyone',
		default_read_receipts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
		default_notification_settings TEXT NOT NULL DEFAULT '{"messageNotifications":true,"messagePreview":true,"messageSound":true,"callNotifications":true,"ringtoneEnabled":true,"quietHoursEnabled":false,"quietHoursStart":"22:00","quietHoursEnd":"07:00"}',
		public_app_url TEXT,
		public_api_url TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`,
	`CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		family_id TEXT NOT NULL,
		email TEXT NOT NULL UNIQUE,
		username TEXT NOT NULL UNIQUE,
		password_hash TEXT NOT NULL,
		display_name TEXT NOT NULL,
		role TEXT NOT NULL,
		is_active INTEGER NOT NULL DEFAULT 1,
		public_key TEXT,
		profile_photo_file_id TEXT,
		created_at TEXT NOT NULL,
		last_seen_at TEXT,
		last_seen_visibility TEXT NOT NULL DEFAULT 'everyone',
		FOREIGN KEY (family_id) REFERENCES families(id)
	);`,
	`CREATE TABLE IF NOT EXISTS refresh_tokens (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		token_hash TEXT NOT NULL UNIQUE,
		expires_at TEXT NOT NULL,
		created_at TEXT NOT NULL,
		revoked_at TEXT,
		ip_address TEXT,
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS invites (
		id TEXT PRIMARY KEY,
		family_id TEXT NOT NULL,
		token_hash TEXT NOT NULL UNIQUE,
		role TEXT NOT NULL,
		expires_at TEXT NOT NULL,
		max_uses INTEGER NOT NULL,
		used_count INTEGER NOT NULL DEFAULT 0,
		created_by TEXT NOT NULL,
		created_at TEXT NOT NULL,
		revoked_at TEXT,
		FOREIGN KEY (family_id) REFERENCES families(id),
		FOREIGN KEY (created_by) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS chats (
		id TEXT PRIMARY KEY,
		family_id TEXT NOT NULL,
		type TEXT NOT NULL,
		title TEXT,
		created_by TEXT,
		chat_photo_file_id TEXT,
		media_visibility TEXT NOT NULL,
		comments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
		encryption_protocol TEXT NOT NULL DEFAULT 'server_at_rest',
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		pin_permission TEXT NOT NULL DEFAULT 'everyone',
		message_delay_seconds INTEGER NOT NULL DEFAULT 0,
		FOREIGN KEY (family_id) REFERENCES families(id)
	);`,
	`CREATE TABLE IF NOT EXISTS chat_members (
		chat_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (chat_id, user_id),
		FOREIGN KEY (chat_id) REFERENCES chats(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS chat_preferences (
		chat_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		is_muted BOOLEAN NOT NULL DEFAULT FALSE,
		is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
		is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
		last_read_message_id TEXT,
		last_read_at TEXT,
		wallpaper_file_id TEXT,
		PRIMARY KEY (chat_id, user_id),
		FOREIGN KEY (chat_id) REFERENCES chats(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS chat_media_approvals (
		chat_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (chat_id, user_id),
		FOREIGN KEY (chat_id) REFERENCES chats(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS files (
		id TEXT PRIMARY KEY,
		family_id TEXT NOT NULL,
		uploaded_by TEXT NOT NULL,
		chat_id TEXT,
		access_scope TEXT NOT NULL,
		storage_provider TEXT NOT NULL,
		object_key TEXT NOT NULL,
		lifecycle_state TEXT NOT NULL DEFAULT 'ready',
		object_revision TEXT,
		object_etag TEXT,
		original_name TEXT NOT NULL,
		mime_type TEXT NOT NULL,
		detected_mime_type TEXT,
		size_bytes INTEGER NOT NULL,
		checksum TEXT,
		created_at TEXT NOT NULL,
		deleted_at TEXT,
		preview_revision TEXT,
		preview_status TEXT NOT NULL DEFAULT 'none',
		validation_failure_code TEXT,
		validated_at TEXT,
		FOREIGN KEY (family_id) REFERENCES families(id),
		FOREIGN KEY (uploaded_by) REFERENCES users(id),
		FOREIGN KEY (chat_id) REFERENCES chats(id)
	);`,
	`CREATE TABLE IF NOT EXISTS file_uploads (
		id TEXT PRIMARY KEY,
		file_id TEXT NOT NULL UNIQUE,
		family_id TEXT NOT NULL,
		uploaded_by TEXT NOT NULL,
		chat_id TEXT,
		access_scope TEXT NOT NULL,
		idempotency_key TEXT NOT NULL,
		request_hash TEXT NOT NULL,
		upload_mode TEXT NOT NULL,
		multipart_upload_id TEXT,
		object_key TEXT NOT NULL,
		expected_mime_type TEXT NOT NULL,
		expected_size_bytes BIGINT NOT NULL,
		expected_checksum TEXT,
		state TEXT NOT NULL DEFAULT 'reserved',
		failure_code TEXT,
		expires_at TEXT NOT NULL,
		completed_at TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		UNIQUE (uploaded_by, idempotency_key),
		FOREIGN KEY (file_id) REFERENCES files(id),
		FOREIGN KEY (family_id) REFERENCES families(id),
		FOREIGN KEY (uploaded_by) REFERENCES users(id),
		FOREIGN KEY (chat_id) REFERENCES chats(id)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_file_uploads_state_expires_at ON file_uploads(state, expires_at);`,
	`CREATE TABLE IF NOT EXISTS file_preferences (
		file_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
		PRIMARY KEY (file_id, user_id),
		FOREIGN KEY (file_id) REFERENCES files(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS media_quality_settings (
		family_id TEXT NOT NULL,
		media_type TEXT NOT NULL,
		extension TEXT NOT NULL DEFAULT '',
		quality_percent INTEGER NOT NULL,
		updated_at TEXT NOT NULL,
		PRIMARY KEY (family_id, media_type, extension),
		FOREIGN KEY (family_id) REFERENCES families(id)
	);`,
	`CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		chat_id TEXT NOT NULL,
		sender_id TEXT NOT NULL,
		type TEXT NOT NULL,
		content TEXT,
		encryption_protocol TEXT NOT NULL DEFAULT 'legacy_plaintext',
		ciphertext TEXT,
		nonce TEXT,
		key_version INTEGER,
		encryption_metadata TEXT,
		reply_to_message_id TEXT,
		thread_root_message_id TEXT,
		message_kind TEXT NOT NULL DEFAULT 'chat',
		forwarded_from_message_id TEXT,
		forwarded_from_chat_id TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		deleted_at TEXT,
		FOREIGN KEY (chat_id) REFERENCES chats(id),
		FOREIGN KEY (sender_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS message_statuses (
		message_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		status TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (message_id, user_id, status),
		FOREIGN KEY (message_id) REFERENCES messages(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS message_attachments (
		message_id TEXT NOT NULL,
		file_id TEXT NOT NULL,
		PRIMARY KEY (message_id, file_id),
		FOREIGN KEY (message_id) REFERENCES messages(id),
		FOREIGN KEY (file_id) REFERENCES files(id)
	);`,
	`CREATE TABLE IF NOT EXISTS message_reactions (
		message_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		emoji TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (message_id, user_id, emoji),
		FOREIGN KEY (message_id) REFERENCES messages(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS message_user_deletions (
		message_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		deleted_at TEXT NOT NULL,
		PRIMARY KEY (message_id, user_id),
		FOREIGN KEY (message_id) REFERENCES messages(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS pinned_messages (
		chat_id TEXT NOT NULL,
		message_id TEXT NOT NULL,
		pinned_by TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (chat_id, message_id),
		FOREIGN KEY (chat_id) REFERENCES chats(id),
		FOREIGN KEY (message_id) REFERENCES messages(id),
		FOREIGN KEY (pinned_by) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS plans (
		id TEXT PRIMARY KEY,
		family_id TEXT NOT NULL,
		title TEXT NOT NULL,
		description TEXT,
		start_time TEXT NOT NULL,
		end_time TEXT,
		location TEXT,
		source_chat_id TEXT,
		created_by TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		deleted_at TEXT,
		FOREIGN KEY (family_id) REFERENCES families(id),
		FOREIGN KEY (created_by) REFERENCES users(id),
		FOREIGN KEY (source_chat_id) REFERENCES chats(id)
	);`,
	`CREATE TABLE IF NOT EXISTS plan_attendees (
		plan_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'going',
		updated_at TEXT NOT NULL,
		PRIMARY KEY (plan_id, user_id),
		FOREIGN KEY (plan_id) REFERENCES plans(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS call_sessions (
		id TEXT PRIMARY KEY,
		room_id TEXT NOT NULL UNIQUE,
		chat_id TEXT NOT NULL,
		caller_id TEXT NOT NULL,
		status TEXT NOT NULL,
		started_at TEXT NOT NULL,
		ended_at TEXT,
		created_at TEXT NOT NULL,
		FOREIGN KEY (chat_id) REFERENCES chats(id),
		FOREIGN KEY (caller_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS call_participants (
		room_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		status TEXT NOT NULL,
		joined_at TEXT NOT NULL,
		left_at TEXT,
		PRIMARY KEY (room_id, user_id),
		FOREIGN KEY (room_id) REFERENCES call_sessions(room_id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS user_blocks (
		blocker_user_id TEXT NOT NULL,
		blocked_user_id TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (blocker_user_id, blocked_user_id),
		FOREIGN KEY (blocker_user_id) REFERENCES users(id),
		FOREIGN KEY (blocked_user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS mcp_connectors (
		id TEXT PRIMARY KEY,
		family_id TEXT NOT NULL,
		name TEXT NOT NULL,
		transport TEXT NOT NULL,
		command TEXT,
		url TEXT,
		headers TEXT,
		bearer_token TEXT,
		actor_user_id TEXT NOT NULL,
		status TEXT NOT NULL,
		last_error TEXT,
		last_connected_at TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		FOREIGN KEY (family_id) REFERENCES families(id),
		FOREIGN KEY (actor_user_id) REFERENCES users(id)
	);`,
	`CREATE TABLE IF NOT EXISTS mcp_connector_chats (
		connector_id TEXT NOT NULL,
		chat_id TEXT NOT NULL,
		PRIMARY KEY (connector_id, chat_id),
		FOREIGN KEY (connector_id) REFERENCES mcp_connectors(id),
		FOREIGN KEY (chat_id) REFERENCES chats(id)
	);`,
	`CREATE TABLE IF NOT EXISTS mcp_audit_events (
		id TEXT PRIMARY KEY,
		family_id TEXT NOT NULL,
		connector_id TEXT NOT NULL,
		event_type TEXT NOT NULL,
		tool_name TEXT,
		actor_user_id TEXT NOT NULL,
		details TEXT,
		created_at TEXT NOT NULL,
		FOREIGN KEY (family_id) REFERENCES families(id),
		FOREIGN KEY (connector_id) REFERENCES mcp_connectors(id),
		FOREIGN KEY (actor_user_id) REFERENCES users(id)
	);`,
	`CREATE UNIQUE INDEX IF NOT EXISTS uq_family_chat_per_family ON chats(family_id) WHERE type = 'family';`,
}

// transcriptionSchemaStatements bootstraps AI Notes for independently
// provisioned tenant databases. Tenant databases are not migrated by Atlas at
// creation time, so this must run before the startup repair ALTER statements.
var transcriptionSchemaStatements = []string{
	`CREATE TABLE IF NOT EXISTS call_transcription_sessions (
		id text PRIMARY KEY,
		call_id text NOT NULL,
		initiated_by text NOT NULL,
		status text NOT NULL,
		provider text NOT NULL DEFAULT 'groq',
		provider_model text NOT NULL DEFAULT 'whisper-large-v3-turbo',
		started_at timestamp with time zone,
		stopped_at timestamp with time zone,
		completed_at timestamp with time zone,
		submitted_audio_ms bigint NOT NULL DEFAULT 0,
		estimated_cost_usd numeric(12,6),
		detected_languages jsonb NOT NULL DEFAULT '[]'::jsonb,
		failure_code text,
		failure_message text,
		artifact_exact_key text,
		artifact_cleaned_key text,
		artifact_vtt_key text,
		artifact_summary_key text,
		summary_json jsonb,
		created_at timestamp with time zone NOT NULL DEFAULT now(),
		updated_at timestamp with time zone NOT NULL DEFAULT now()
	);`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_call_transcription_sessions_call_id_active
		ON call_transcription_sessions (call_id)
		WHERE status IN ('starting', 'recording', 'stopping', 'queued', 'validating_audio', 'transcribing', 'postprocessing');`,
	`CREATE INDEX IF NOT EXISTS idx_call_transcription_sessions_call_id ON call_transcription_sessions (call_id);`,
	`CREATE INDEX IF NOT EXISTS idx_call_transcription_sessions_status ON call_transcription_sessions (status);`,
	`CREATE TABLE IF NOT EXISTS call_audio_chunks (
		id text PRIMARY KEY,
		session_id text NOT NULL,
		participant_id text NOT NULL,
		sequence_number integer NOT NULL,
		object_key text NOT NULL,
		container text NOT NULL,
		codec text NOT NULL,
		call_start_ms bigint NOT NULL,
		call_end_ms bigint NOT NULL,
		duration_ms bigint NOT NULL,
		object_size_bytes bigint,
		checksum_sha256 text,
		client_vad_score real,
		server_vad_status text,
		upload_status text NOT NULL DEFAULT 'pending',
		created_at timestamp with time zone NOT NULL DEFAULT now(),
		CONSTRAINT call_audio_chunks_session_participant_seq UNIQUE (session_id, participant_id, sequence_number)
	);`,
	`CREATE INDEX IF NOT EXISTS idx_call_audio_chunks_session_id ON call_audio_chunks (session_id);`,
	`CREATE INDEX IF NOT EXISTS idx_call_audio_chunks_participant_id ON call_audio_chunks (participant_id);`,
	`CREATE TABLE IF NOT EXISTS call_transcript_segments (
		id text PRIMARY KEY,
		call_id text NOT NULL,
		session_id text NOT NULL,
		participant_id text NOT NULL,
		start_ms bigint NOT NULL,
		end_ms bigint NOT NULL,
		exact_text text NOT NULL,
		cleaned_text text,
		detected_language text,
		confidence real,
		package_id text,
		provider_segment_index integer,
		created_at timestamp with time zone NOT NULL DEFAULT now(),
		updated_at timestamp with time zone NOT NULL DEFAULT now()
	);`,
	`CREATE INDEX IF NOT EXISTS idx_call_transcript_segments_session_start ON call_transcript_segments (session_id, start_ms);`,
	`CREATE INDEX IF NOT EXISTS idx_call_transcript_segments_call_start ON call_transcript_segments (call_id, start_ms);`,
	`CREATE INDEX IF NOT EXISTS idx_call_transcript_segments_participant ON call_transcript_segments (participant_id, start_ms);`,
	`CREATE INDEX IF NOT EXISTS idx_call_transcript_segments_fts ON call_transcript_segments USING gin(to_tsvector('simple', exact_text));`,
	`CREATE TABLE IF NOT EXISTS call_transcription_packages (
		id text PRIMARY KEY,
		session_id text NOT NULL,
		participant_id text NOT NULL,
		object_key text,
		duration_ms bigint NOT NULL DEFAULT 0,
		regions jsonb NOT NULL DEFAULT '[]'::jsonb,
		provider_response jsonb,
		status text NOT NULL DEFAULT 'pending',
		created_at timestamp with time zone NOT NULL DEFAULT now(),
		updated_at timestamp with time zone NOT NULL DEFAULT now()
	);`,
	`CREATE INDEX IF NOT EXISTS idx_call_transcription_packages_session_id ON call_transcription_packages (session_id);`,
}

// schemaRepairStatements are idempotent ALTER / DO $$ statements that fix
// schema issues introduced in earlier versions of the application. They are
// executed with errors ignored so they never block startup on a fresh database.
var schemaRepairStatements = []string{
	`CREATE TABLE IF NOT EXISTS server_roles (
		id TEXT PRIMARY KEY,
		family_id TEXT NOT NULL,
		name TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		permissions TEXT NOT NULL DEFAULT '[]',
		is_default BOOLEAN NOT NULL DEFAULT FALSE,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		UNIQUE (family_id, name),
		FOREIGN KEY (family_id) REFERENCES families(id)
	);`,
	`ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id TEXT;`,
	`CREATE INDEX IF NOT EXISTS idx_users_family_role_id ON users (family_id, role_id);`,
	`INSERT INTO server_roles (id, family_id, name, description, permissions, is_default, created_at, updated_at)
	 SELECT families.id || ':admin', families.id, 'Admin', 'Full server administration', '["manage_server","manage_roles","manage_members","manage_channels","manage_messages","manage_calls","manage_plans","manage_files","manage_integrations"]', TRUE, NOW()::text, NOW()::text FROM families
	 ON CONFLICT (id) DO NOTHING;`,
	`INSERT INTO server_roles (id, family_id, name, description, permissions, is_default, created_at, updated_at)
	 SELECT families.id || ':member', families.id, 'Member', '', '[]', TRUE, NOW()::text, NOW()::text FROM families
	 ON CONFLICT (id) DO NOTHING;`,
	`UPDATE users SET role_id = family_id || CASE WHEN role IN ('owner', 'admin') THEN ':admin' ELSE ':member' END WHERE role_id IS NULL;`,
	`ALTER TABLE families ADD COLUMN IF NOT EXISTS default_profile_visibility TEXT NOT NULL DEFAULT 'everyone';`,
	`ALTER TABLE families ADD COLUMN IF NOT EXISTS default_last_seen_visibility TEXT NOT NULL DEFAULT 'everyone';`,
	`UPDATE families SET default_profile_visibility = 'everyone' WHERE default_profile_visibility = 'family';`,
	`UPDATE families SET default_last_seen_visibility = 'everyone' WHERE default_last_seen_visibility = 'family';`,
	`ALTER TABLE families ADD COLUMN IF NOT EXISTS default_read_receipts_enabled BOOLEAN NOT NULL DEFAULT TRUE;`,
	`ALTER TABLE families ADD COLUMN IF NOT EXISTS default_notification_settings TEXT NOT NULL DEFAULT '{"messageNotifications":true,"messagePreview":true,"messageSound":true,"callNotifications":true,"ringtoneEnabled":true,"quietHoursEnabled":false,"quietHoursStart":"22:00","quietHoursEnd":"07:00"}';`,
	`DO $$ BEGIN
		IF EXISTS (
			SELECT 1 FROM information_schema.table_constraints
			WHERE table_name = 'chat_members' AND constraint_type = 'PRIMARY KEY'
		) THEN
			IF (
				SELECT count(*) FROM information_schema.key_column_usage
				WHERE table_name = 'chat_members'
				  AND constraint_name = (
					SELECT constraint_name FROM information_schema.table_constraints
					WHERE table_name = 'chat_members' AND constraint_type = 'PRIMARY KEY' LIMIT 1
				  )
			) < 2 THEN
				ALTER TABLE chat_members DROP CONSTRAINT IF EXISTS chat_members_pkey;
				ALTER TABLE chat_members ADD CONSTRAINT chat_members_pkey PRIMARY KEY (chat_id, user_id);
			END IF;
		END IF;
	END $$;`,
	`DO $$ BEGIN
		IF EXISTS (
			SELECT 1 FROM information_schema.table_constraints
			WHERE table_name = 'chat_preferences' AND constraint_type = 'PRIMARY KEY'
		) THEN
			IF (
				SELECT count(*) FROM information_schema.key_column_usage
				WHERE table_name = 'chat_preferences'
				  AND constraint_name = (
					SELECT constraint_name FROM information_schema.table_constraints
					WHERE table_name = 'chat_preferences' AND constraint_type = 'PRIMARY KEY' LIMIT 1
				  )
			) < 2 THEN
				ALTER TABLE chat_preferences DROP CONSTRAINT IF EXISTS chat_preferences_pkey;
				ALTER TABLE chat_preferences ADD CONSTRAINT chat_preferences_pkey PRIMARY KEY (chat_id, user_id);
			END IF;
		END IF;
	END $$;`,
	`DO $$ BEGIN
		IF EXISTS (
			SELECT 1 FROM information_schema.table_constraints
			WHERE table_name = 'chat_media_approvals' AND constraint_type = 'PRIMARY KEY'
		) THEN
			IF (
				SELECT count(*) FROM information_schema.key_column_usage
				WHERE table_name = 'chat_media_approvals'
				  AND constraint_name = (
					SELECT constraint_name FROM information_schema.table_constraints
					WHERE table_name = 'chat_media_approvals' AND constraint_type = 'PRIMARY KEY' LIMIT 1
				  )
			) < 2 THEN
				ALTER TABLE chat_media_approvals DROP CONSTRAINT IF EXISTS chat_media_approvals_pkey;
				ALTER TABLE chat_media_approvals ADD CONSTRAINT chat_media_approvals_pkey PRIMARY KEY (chat_id, user_id);
			END IF;
		END IF;
	END $$;`,
	`DO $$ BEGIN
		IF EXISTS (
			SELECT 1 FROM information_schema.table_constraints
			WHERE table_name = 'file_preferences' AND constraint_type = 'PRIMARY KEY'
		) THEN
			IF (
				SELECT count(*) FROM information_schema.key_column_usage
				WHERE table_name = 'file_preferences'
				  AND constraint_name = (
					SELECT constraint_name FROM information_schema.table_constraints
					WHERE table_name = 'file_preferences' AND constraint_type = 'PRIMARY KEY' LIMIT 1
				  )
			) < 2 THEN
				ALTER TABLE file_preferences DROP CONSTRAINT IF EXISTS file_preferences_pkey;
				ALTER TABLE file_preferences ADD CONSTRAINT file_preferences_pkey PRIMARY KEY (file_id, user_id);
			END IF;
		END IF;
	END $$;`,
	`DO $$ BEGIN
		IF EXISTS (
			SELECT 1 FROM information_schema.table_constraints
			WHERE table_name = 'message_attachments' AND constraint_type = 'PRIMARY KEY'
		) THEN
			IF (
				SELECT count(*) FROM information_schema.key_column_usage
				WHERE table_name = 'message_attachments'
				  AND constraint_name = (
					SELECT constraint_name FROM information_schema.table_constraints
					WHERE table_name = 'message_attachments' AND constraint_type = 'PRIMARY KEY' LIMIT 1
				  )
			) < 2 THEN
				ALTER TABLE message_attachments DROP CONSTRAINT IF EXISTS message_attachments_pkey;
				ALTER TABLE message_attachments ADD CONSTRAINT message_attachments_pkey PRIMARY KEY (message_id, file_id);
			END IF;
		END IF;
	END $$;`,
	`DO $$ BEGIN
		IF EXISTS (
			SELECT 1 FROM information_schema.table_constraints
			WHERE table_name = 'message_reactions' AND constraint_type = 'PRIMARY KEY'
		) THEN
			IF (
				SELECT count(*) FROM information_schema.key_column_usage
				WHERE table_name = 'message_reactions'
				  AND constraint_name = (
					SELECT constraint_name FROM information_schema.table_constraints
					WHERE table_name = 'message_reactions' AND constraint_type = 'PRIMARY KEY' LIMIT 1
				  )
			) < 3 THEN
				ALTER TABLE message_reactions DROP CONSTRAINT IF EXISTS message_reactions_pkey;
				ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (message_id, user_id, emoji);
			END IF;
		END IF;
	END $$;`,
	`DO $$ BEGIN
		IF EXISTS (
			SELECT 1 FROM information_schema.table_constraints
			WHERE table_name = 'message_statuses' AND constraint_type = 'PRIMARY KEY'
		) THEN
			IF (
				SELECT count(*) FROM information_schema.key_column_usage
				WHERE table_name = 'message_statuses'
				  AND constraint_name = (
					SELECT constraint_name FROM information_schema.table_constraints
					WHERE table_name = 'message_statuses' AND constraint_type = 'PRIMARY KEY' LIMIT 1
				  )
			) < 3 THEN
				ALTER TABLE message_statuses DROP CONSTRAINT IF EXISTS message_statuses_pkey;
				ALTER TABLE message_statuses ADD CONSTRAINT message_statuses_pkey PRIMARY KEY (message_id, user_id, status);
			END IF;
		END IF;
	END $$;`,
	`DO $$ BEGIN
		IF EXISTS (
			SELECT 1 FROM information_schema.table_constraints
			WHERE table_name = 'message_user_deletions' AND constraint_type = 'PRIMARY KEY'
		) THEN
			IF (
				SELECT count(*) FROM information_schema.key_column_usage
				WHERE table_name = 'message_user_deletions'
				  AND constraint_name = (
					SELECT constraint_name FROM information_schema.table_constraints
					WHERE table_name = 'message_user_deletions' AND constraint_type = 'PRIMARY KEY' LIMIT 1
				  )
			) < 2 THEN
				ALTER TABLE message_user_deletions DROP CONSTRAINT IF EXISTS message_user_deletions_pkey;
				ALTER TABLE message_user_deletions ADD CONSTRAINT message_user_deletions_pkey PRIMARY KEY (message_id, user_id);
			END IF;
		END IF;
	END $$;`,
	`DO $$ BEGIN
		IF EXISTS (
			SELECT 1 FROM information_schema.table_constraints
			WHERE table_name = 'pinned_messages' AND constraint_type = 'PRIMARY KEY'
		) THEN
			IF (
				SELECT count(*) FROM information_schema.key_column_usage
				WHERE table_name = 'pinned_messages'
				  AND constraint_name = (
					SELECT constraint_name FROM information_schema.table_constraints
					WHERE table_name = 'pinned_messages' AND constraint_type = 'PRIMARY KEY' LIMIT 1
				  )
			) < 2 THEN
				ALTER TABLE pinned_messages DROP CONSTRAINT IF EXISTS pinned_messages_pkey;
				ALTER TABLE pinned_messages ADD CONSTRAINT pinned_messages_pkey PRIMARY KEY (chat_id, message_id);
			END IF;
		END IF;
	END $$;`,
}
