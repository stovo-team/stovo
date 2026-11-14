-- Repair built-in roles for tenants created after the original one-time seed,
-- and restore missing built-ins without overwriting tenant data.
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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

-- Match the original migration's role mapping for users created after it ran,
-- while preserving every existing non-null role assignment.
UPDATE users u
SET role_id = u.family_id || CASE WHEN u.role IN ('owner', 'admin') THEN ':admin' ELSE ':member' END
WHERE u.role_id IS NULL
  AND EXISTS (
      SELECT 1 FROM server_roles r
      WHERE r.id = u.family_id || CASE WHEN u.role IN ('owner', 'admin') THEN ':admin' ELSE ':member' END
  );
