-- Store independent camera and screen-share quality defaults per call type.
ALTER TABLE public.families
    ADD COLUMN IF NOT EXISTS camera_bitrate_kbps integer NOT NULL DEFAULT 1500,
    ADD COLUMN IF NOT EXISTS group_call_screen_share_bitrate_kbps integer NOT NULL DEFAULT 5000,
    ADD COLUMN IF NOT EXISTS group_call_camera_bitrate_kbps integer NOT NULL DEFAULT 1500,
    ADD COLUMN IF NOT EXISTS dm_call_screen_share_bitrate_kbps integer NOT NULL DEFAULT 5000,
    ADD COLUMN IF NOT EXISTS dm_call_camera_bitrate_kbps integer NOT NULL DEFAULT 1500;

ALTER TABLE public.families
    ADD CONSTRAINT families_camera_bitrate_kbps_range
        CHECK (camera_bitrate_kbps BETWEEN 1000 AND 20000),
    ADD CONSTRAINT families_group_call_screen_share_bitrate_kbps_range
        CHECK (group_call_screen_share_bitrate_kbps BETWEEN 1000 AND 20000),
    ADD CONSTRAINT families_group_call_camera_bitrate_kbps_range
        CHECK (group_call_camera_bitrate_kbps BETWEEN 1000 AND 20000),
    ADD CONSTRAINT families_dm_call_screen_share_bitrate_kbps_range
        CHECK (dm_call_screen_share_bitrate_kbps BETWEEN 1000 AND 20000),
    ADD CONSTRAINT families_dm_call_camera_bitrate_kbps_range
        CHECK (dm_call_camera_bitrate_kbps BETWEEN 1000 AND 20000);
