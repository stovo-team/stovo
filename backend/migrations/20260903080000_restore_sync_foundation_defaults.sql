-- Restore every default used by the durable sync/outbox writers. Older
-- runtime Ent schema migration removed these Atlas-owned defaults from some
-- tenant databases, turning otherwise valid inserts into NOT NULL failures.

ALTER TABLE sync_events
    ALTER COLUMN schema_version SET DEFAULT 1,
    ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
    ALTER COLUMN occurred_at SET DEFAULT now();

ALTER TABLE sync_event_recipients
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE client_operations
    ALTER COLUMN response_body SET DEFAULT '{}'::jsonb,
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE outbox_events
    ALTER COLUMN schema_version SET DEFAULT 1,
    ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN available_at SET DEFAULT now(),
    ALTER COLUMN attempts SET DEFAULT 0;

ALTER TABLE consumer_receipts
    ALTER COLUMN completed_at SET DEFAULT now();

ALTER TABLE notification_deliveries
    ALTER COLUMN attempts SET DEFAULT 0,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET DEFAULT now();
