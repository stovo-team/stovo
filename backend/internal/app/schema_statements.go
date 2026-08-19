package app

// schemaStatements contains the CREATE TABLE / CREATE INDEX DDL statements
// that establish the base schema. Each statement is idempotent (IF NOT EXISTS).
var schemaStatements = []string{
	`+"`"+`CREATE TABLE IF NOT EXISTS families (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		storage_limit_mb INTEGER,
		minimized_chat_layout BOOLEAN NOT NULL DEFAULT FALSE,
		default_message_encryption_protocol TEXT NOT NULL DEFAULT 'server_at_rest',
		public_app_url TEXT,
		public_api_url TEXT,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS users (
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
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS refresh_tokens (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		token_hash TEXT NOT NULL UNIQUE,
		expires_at TEXT NOT NULL,
		created_at TEXT NOT NULL,
		revoked_at TEXT,
		ip_address TEXT,
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS invites (
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
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS chats (
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
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS chat_members (
		chat_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (chat_id, user_id),
		FOREIGN KEY (chat_id) REFERENCES chats(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS chat_preferences (
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
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS chat_media_approvals (
		chat_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (chat_id, user_id),
		FOREIGN KEY (chat_id) REFERENCES chats(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS files (
		id TEXT PRIMARY KEY,
		family_id TEXT NOT NULL,
		uploaded_by TEXT NOT NULL,
		chat_id TEXT,
		access_scope TEXT NOT NULL,
		storage_provider TEXT NOT NULL,
		object_key TEXT NOT NULL,
		original_name TEXT NOT NULL,
		mime_type TEXT NOT NULL,
		size_bytes INTEGER NOT NULL,
		checksum TEXT,
		created_at TEXT NOT NULL,
		deleted_at TEXT,
		FOREIGN KEY (family_id) REFERENCES families(id),
		FOREIGN KEY (uploaded_by) REFERENCES users(id),
		FOREIGN KEY (chat_id) REFERENCES chats(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS file_preferences (
		file_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
		PRIMARY KEY (file_id, user_id),
		FOREIGN KEY (file_id) REFERENCES files(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS media_quality_settings (
		family_id TEXT NOT NULL,
		media_type TEXT NOT NULL,
		extension TEXT NOT NULL DEFAULT '',
		quality_percent INTEGER NOT NULL,
		updated_at TEXT NOT NULL,
		PRIMARY KEY (family_id, media_type, extension),
		FOREIGN KEY (family_id) REFERENCES families(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS messages (
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
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS message_statuses (
		message_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		status TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (message_id, user_id, status),
		FOREIGN KEY (message_id) REFERENCES messages(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS message_attachments (
		message_id TEXT NOT NULL,
		file_id TEXT NOT NULL,
		PRIMARY KEY (message_id, file_id),
		FOREIGN KEY (message_id) REFERENCES messages(id),
		FOREIGN KEY (file_id) REFERENCES files(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS message_reactions (
		message_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		emoji TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (message_id, user_id, emoji),
		FOREIGN KEY (message_id) REFERENCES messages(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS message_user_deletions (
		message_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		deleted_at TEXT NOT NULL,
		PRIMARY KEY (message_id, user_id),
		FOREIGN KEY (message_id) REFERENCES messages(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS pinned_messages (
		chat_id TEXT NOT NULL,
		message_id TEXT NOT NULL,
		pinned_by TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (chat_id, message_id),
		FOREIGN KEY (chat_id) REFERENCES chats(id),
		FOREIGN KEY (message_id) REFERENCES messages(id),
		FOREIGN KEY (pinned_by) REFERENCES users(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS plans (
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
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS plan_attendees (
		plan_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'going',
		updated_at TEXT NOT NULL,
		PRIMARY KEY (plan_id, user_id),
		FOREIGN KEY (plan_id) REFERENCES plans(id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS call_sessions (
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
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS call_participants (
		room_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		status TEXT NOT NULL,
		joined_at TEXT NOT NULL,
		left_at TEXT,
		PRIMARY KEY (room_id, user_id),
		FOREIGN KEY (room_id) REFERENCES call_sessions(room_id),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS user_blocks (
		blocker_user_id TEXT NOT NULL,
		blocked_user_id TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (blocker_user_id, blocked_user_id),
		FOREIGN KEY (blocker_user_id) REFERENCES users(id),
		FOREIGN KEY (blocked_user_id) REFERENCES users(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS mcp_connectors (
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
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS mcp_connector_chats (
		connector_id TEXT NOT NULL,
		chat_id TEXT NOT NULL,
		PRIMARY KEY (connector_id, chat_id),
		FOREIGN KEY (connector_id) REFERENCES mcp_connectors(id),
		FOREIGN KEY (chat_id) REFERENCES chats(id)
	);`+"`"+`,
	`+"`"+`CREATE TABLE IF NOT EXISTS mcp_audit_events (
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
	);`+"`"+`,
	`+"`"+`CREATE UNIQUE INDEX IF NOT EXISTS uq_family_chat_per_family ON chats(family_id) WHERE type = 'family';`+"`"+`,
}

// schemaRepairStatements are idempotent ALTER / DO $$ statements that fix
// schema issues introduced in earlier versions of the application. They are
// executed with errors ignored so they never block startup on a fresh database.
var schemaRepairStatements = []string{
	`+"`"+`DO $$ BEGIN
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
	END $$;`+"`"+`,
	`+"`"+`DO $$ BEGIN
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
	END $$;`+"`"+`,
	`+"`"+`DO $$ BEGIN
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
	END $$;`+"`"+`,
	`+"`"+`DO $$ BEGIN
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
	END $$;`+"`"+`,
	`+"`"+`DO $$ BEGIN
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
	END $$;`+"`"+`,
	`+"`"+`DO $$ BEGIN
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
	END $$;`+"`"+`,
	`+"`"+`DO $$ BEGIN
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
	END $$;`+"`"+`,
	`+"`"+`DO $$ BEGIN
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
	END $$;`+"`"+`,
	`+"`"+`DO $$ BEGIN
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
	END $$;`+"`"+`,
}
