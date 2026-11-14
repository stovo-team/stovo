// Package roles provides the Postgres implementation for the role feature.
package roles

import (
	"context"
	"database/sql"
	"encoding/json"

	featureroles "stovo-messenger/backend/internal/features/roles"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

const roleSelect = `SELECT r.id, r.name, r.description, r.permissions, r.is_default, COUNT(u.id)
	FROM server_roles r LEFT JOIN users u ON u.role_id = r.id AND u.is_active = 1`
const roleGroup = ` GROUP BY r.id, r.name, r.description, r.permissions, r.is_default`

func (s *PostgresStore) UserRoleID(ctx context.Context, userID string) (string, error) {
	var roleID string
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(role_id, '') FROM users WHERE id = $1`, userID).Scan(&roleID)
	return roleID, err
}

func (s *PostgresStore) Get(ctx context.Context, familyID, roleID string) (featureroles.Role, error) {
	return scanRole(s.db.QueryRowContext(ctx, roleSelect+` WHERE r.family_id = $1 AND r.id = $2`+roleGroup, familyID, roleID))
}
func (s *PostgresStore) List(ctx context.Context, familyID string) ([]featureroles.Role, error) {
	if err := s.ensureDefaultRoles(ctx, familyID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, roleSelect+` WHERE r.family_id = $1`+roleGroup+` ORDER BY r.is_default DESC, r.name`, familyID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var result []featureroles.Role
	for rows.Next() {
		role, err := scanRole(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, role)
	}
	return result, rows.Err()
}

// ensureDefaultRoles repairs missing built-in rows and fills only null user
// assignments from the legacy role column. Existing roles and assignments stay
// untouched; conflicts on stable IDs or family role names are left as-is.
func (s *PostgresStore) ensureDefaultRoles(ctx context.Context, familyID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO server_roles (id, family_id, name, description, permissions, is_default, created_at, updated_at)
		VALUES
			($1, $2, 'Admin', 'Full server administration', '["manage_server","manage_roles","manage_members","manage_channels","manage_messages","manage_calls","manage_plans","manage_files","manage_integrations"]', TRUE, now()::text, now()::text),
			($3, $2, 'Member', '', '[]', TRUE, now()::text, now()::text)
		ON CONFLICT DO NOTHING`, familyID+`:admin`, familyID, familyID+`:member`)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE users u SET role_id = u.family_id || CASE WHEN u.role IN ('owner','admin') THEN ':admin' ELSE ':member' END WHERE u.family_id=$1 AND u.role_id IS NULL AND EXISTS (SELECT 1 FROM server_roles r WHERE r.id = u.family_id || CASE WHEN u.role IN ('owner','admin') THEN ':admin' ELSE ':member' END)`, familyID)
	return err
}
func (s *PostgresStore) Create(ctx context.Context, command featureroles.CreateCommand) error {
	permissions, err := json.Marshal(command.Permissions)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO server_roles (id, family_id, name, description, permissions, is_default, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,FALSE,$6,$6)`, command.ID, command.FamilyID, command.Name, command.Description, string(permissions), command.CreatedAt)
	return err
}
func (s *PostgresStore) Update(ctx context.Context, command featureroles.UpdateCommand) error {
	permissions, err := json.Marshal(command.Permissions)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE server_roles SET name=$1, description=$2, permissions=$3, updated_at=$4 WHERE id=$5 AND family_id=$6`, command.Name, command.Description, string(permissions), command.UpdatedAt, command.RoleID, command.FamilyID)
	return err
}
func (s *PostgresStore) DeleteReplacingMembers(ctx context.Context, familyID, roleID, replacementRoleID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err = tx.ExecContext(ctx, `UPDATE users SET role_id=$1, role='member' WHERE family_id=$2 AND role_id=$3`, replacementRoleID, familyID, roleID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM server_roles WHERE id=$1 AND family_id=$2`, roleID, familyID); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *PostgresStore) Assign(ctx context.Context, familyID, userID, roleID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET role_id=$1, role=CASE WHEN $1 = family_id || ':admin' THEN 'admin' ELSE 'member' END WHERE id=$2 AND family_id=$3`, roleID, userID, familyID)
	return err
}

type roleScanner interface{ Scan(...any) error }

func scanRole(row roleScanner) (featureroles.Role, error) {
	var role featureroles.Role
	var permissions string
	if err := row.Scan(&role.ID, &role.Name, &role.Description, &permissions, &role.IsDefault, &role.MemberCount); err != nil {
		return featureroles.Role{}, err
	}
	if err := json.Unmarshal([]byte(permissions), &role.Permissions); err != nil {
		return featureroles.Role{}, err
	}
	return role, nil
}
