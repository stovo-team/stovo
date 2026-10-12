-- Migration 001: Create servers table for master orchestrator
CREATE TABLE IF NOT EXISTS servers (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) NOT NULL DEFAULT 'created',
    nav_tabs JSONB DEFAULT '{"chats":true,"storage":true,"plans":true,"settings":true}'::jsonb
);
