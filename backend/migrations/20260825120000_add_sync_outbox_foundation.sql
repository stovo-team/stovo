-- Offline synchronization, client-operation idempotency, and durable
-- asynchronous work foundation. These tables are additive and do not alter
-- existing message or file write paths.

CREATE TABLE sync_events (
    id text PRIMARY KEY,
    sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    family_id text NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
    audience text NOT NULL CHECK (audience IN ('family', 'recipients')),
    event_type text NOT NULL,
    schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_events_family_sequence
    ON sync_events (family_id, sequence);
CREATE INDEX idx_sync_events_occurred_at
    ON sync_events (occurred_at);

CREATE TABLE sync_event_recipients (
    event_id text NOT NULL REFERENCES sync_events(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
);

CREATE INDEX idx_sync_event_recipients_user_event
    ON sync_event_recipients (user_id, event_id);

CREATE TABLE client_operations (
    actor_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    operation_id text NOT NULL,
    operation_type text NOT NULL,
    request_hash text NOT NULL,
    response_status integer NOT NULL CHECK (response_status BETWEEN 100 AND 599),
    response_body jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (actor_user_id, operation_id)
);

CREATE INDEX idx_client_operations_expires_at
    ON client_operations (expires_at);

CREATE TABLE outbox_events (
    id text PRIMARY KEY,
    sync_event_id text REFERENCES sync_events(id) ON DELETE SET NULL,
    family_id text REFERENCES families(id) ON DELETE SET NULL,
    topic text NOT NULL,
    schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    partition_key text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    available_at timestamptz NOT NULL DEFAULT now(),
    lease_owner text,
    lease_expires_at timestamptz,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    published_at timestamptz,
    last_error text
);

CREATE INDEX idx_outbox_events_unpublished_available
    ON outbox_events (available_at, lease_expires_at)
    WHERE published_at IS NULL;
CREATE INDEX idx_outbox_events_topic_created
    ON outbox_events (topic, created_at);
CREATE INDEX idx_outbox_events_sync_event
    ON outbox_events (sync_event_id);

CREATE TABLE consumer_receipts (
    consumer_name text NOT NULL,
    event_id text NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
    result jsonb,
    completed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer_name, event_id)
);

CREATE TABLE notification_deliveries (
    event_id text NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
    recipient_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    channel text NOT NULL,
    state text NOT NULL CHECK (state IN ('pending', 'sending', 'sent', 'failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    provider_id text,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, recipient_id, channel)
);

CREATE INDEX idx_notification_deliveries_state_updated
    ON notification_deliveries (state, updated_at);
