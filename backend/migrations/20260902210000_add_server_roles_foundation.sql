-- Server roles were originally provisioned by runtime schema repair. Make the
-- feature durable for every existing tenant now that Atlas owns migrations.
CREATE TABLE IF NOT EXISTS server_roles (
    id text PRIMARY KEY,
    family_id text NOT NULL REFERENCES families(id),
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    permissions text NOT NULL DEFAULT '[]',
    is_default boolean NOT NULL DEFAULT false,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    UNIQUE (family_id, name)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id text;

CREATE INDEX IF NOT EXISTS idx_users_family_role_id
    ON users (family_id, role_id);

INSERT INTO server_roles (id, family_id, name, description, permissions, is_default, created_at, updated_at)
SELECT
    f.id || ':admin',
    f.id,
    'Admin',
    'Full server administration',
    '["manage_server","manage_roles","manage_members","manage_channels","manage_messages","manage_calls","manage_plans","manage_files","manage_integrations"]',
    true,
    now()::text,
    now()::text
FROM families AS f
ON CONFLICT (id) DO NOTHING;

INSERT INTO server_roles (id, family_id, name, description, permissions, is_default, created_at, updated_at)
SELECT
    f.id || ':member',
    f.id,
    'Member',
    '',
    '[]',
    true,
    now()::text,
    now()::text
FROM families AS f
ON CONFLICT (id) DO NOTHING;

UPDATE users
SET role_id = family_id || CASE WHEN role IN ('owner', 'admin') THEN ':admin' ELSE ':member' END
WHERE role_id IS NULL;
