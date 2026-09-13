-- Per-space ceiling for guest-meeting screen sharing. The value is expressed
-- in kilobits per second so it can be displayed and edited without exposing
-- transport-level byte units to administrators.
ALTER TABLE public.families
    ADD COLUMN IF NOT EXISTS screen_share_bitrate_kbps integer NOT NULL DEFAULT 5000;

ALTER TABLE public.families
    ADD CONSTRAINT families_screen_share_bitrate_kbps_range
    CHECK (screen_share_bitrate_kbps BETWEEN 1000 AND 20000);
