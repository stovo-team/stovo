-- Add default member preferences columns to families table
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS default_profile_visibility text DEFAULT 'everyone'::text NOT NULL;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS default_last_seen_visibility text DEFAULT 'everyone'::text NOT NULL;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS default_read_receipts_enabled boolean DEFAULT true NOT NULL;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS default_notification_settings text DEFAULT '{"messageNotifications":true,"messagePreview":true,"messageSound":true,"callNotifications":true,"ringtoneEnabled":true,"quietHoursEnabled":false,"quietHoursStart":"22:00","quietHoursEnd":"07:00"}'::text NOT NULL;
