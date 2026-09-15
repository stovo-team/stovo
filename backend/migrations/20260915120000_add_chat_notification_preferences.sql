-- Keep the Atlas-owned PostgreSQL schema aligned with the Ent chat_preferences model.
-- Add per-chat notification preference fields for mute duration, silence hours, and sender filtering.
ALTER TABLE public.chat_preferences
    ADD COLUMN IF NOT EXISTS muted_until timestamp with time zone,
    ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS quiet_hours_start text DEFAULT '22:00',
    ADD COLUMN IF NOT EXISTS quiet_hours_end text DEFAULT '07:00',
    ADD COLUMN IF NOT EXISTS notification_mode text NOT NULL DEFAULT 'all',
    ADD COLUMN IF NOT EXISTS notify_sender_ids jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS always_notify_mentions boolean NOT NULL DEFAULT true;
