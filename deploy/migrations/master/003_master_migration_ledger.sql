-- Migration 003: Create schema_migrations ledger table for master database
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Baseline existing schema history if servers table already exists
INSERT INTO schema_migrations (version) VALUES ('001_create_servers') ON CONFLICT (version) DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('002_add_server_settings') ON CONFLICT (version) DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('003_master_migration_ledger') ON CONFLICT (version) DO NOTHING;
