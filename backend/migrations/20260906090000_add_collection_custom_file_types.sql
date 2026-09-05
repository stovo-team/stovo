ALTER TABLE storage_collections
    ADD COLUMN IF NOT EXISTS custom_file_types text NOT NULL DEFAULT '';
