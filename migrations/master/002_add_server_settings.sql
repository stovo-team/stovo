-- Migration 002: Add nav_tabs configuration column to servers table
ALTER TABLE servers ADD COLUMN IF NOT EXISTS nav_tabs JSONB DEFAULT '{"chats":true,"storage":true,"plans":true,"settings":true}'::jsonb;
