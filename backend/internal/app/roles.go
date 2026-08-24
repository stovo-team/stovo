package app

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const (
	permissionManageServer       = "manage_server"
	permissionManageRoles        = "manage_roles"
	permissionManageMembers      = "manage_members"
	permissionManageChannels     = "manage_channels"
	permissionManageMessages     = "manage_messages"
	permissionManageCalls        = "manage_calls"
	permissionManagePlans        = "manage_plans"
	permissionManageFiles        = "manage_files"
	permissionManageIntegrations = "manage_integrations"
)

var allServerPermissions = map[string]struct{}{
	permissionManageServer: {}, permissionManageRoles: {}, permissionManageMembers: {},
	permissionManageChannels: {}, permissionManageMessages: {}, permissionManageCalls: {},
	permissionManagePlans: {}, permissionManageFiles: {}, permissionManageIntegrations: {},
}

func normalizeServerPermissions(values []string) ([]string, bool) {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if _, ok := allServerPermissions[value]; !ok { return nil, false }
		if _, exists := seen[value]; !exists { seen[value] = struct{}{}; result = append(result, value) }
	}
	return result, true
}

func (s *Server) loadServerRole(ctx context.Context, familyID, roleID string) (serverRolePublic, error) {
	var role serverRolePublic
	var permissions string
	err := s.db.QueryRowContext(ctx, `SELECT r.id, r.name, r.description, r.permissions, r.is_default, COUNT(u.id)
		FROM server_roles r LEFT JOIN users u ON u.role_id = r.id AND u.is_active = 1
		WHERE r.family_id = $1 AND r.id = $2 GROUP BY r.id, r.name, r.description, r.permissions, r.is_default`, familyID, roleID).
		Scan(&role.ID, &role.Name, &role.Description, &permissions, &role.IsDefault, &role.MemberCount)
	if err != nil { return serverRolePublic{}, err }
	if json.Unmarshal([]byte(permissions), &role.Permissions) != nil { return serverRolePublic{}, errBadRequest }
	return role, nil
}

func (s *Server) hydrateUserRole(ctx context.Context, user *userPublic) {
	if user.Role == ownerRole { user.Permissions = []string{}; user.RoleName = "Owner"; return }
	role, err := s.loadServerRole(ctx, user.FamilyID, user.RoleID)
	if err != nil { return }
	user.RoleName, user.Permissions = role.Name, role.Permissions
}

func hasPermission(user userPublic, permission string) bool {
	if user.Role == ownerRole { return true }
	for _, value := range user.Permissions { if value == permission { return true } }
	return false
}

func (s *Server) handleListServerRoles(w http.ResponseWriter, r *http.Request, user userPublic) {
	rows, err := s.db.QueryContext(r.Context(), `SELECT r.id, r.name, r.description, r.permissions, r.is_default, COUNT(u.id)
		FROM server_roles r LEFT JOIN users u ON u.role_id = r.id AND u.is_active = 1
		WHERE r.family_id = $1 GROUP BY r.id, r.name, r.description, r.permissions, r.is_default ORDER BY r.is_default DESC, r.name`, user.FamilyID)
	if err != nil { s.detail(w, http.StatusInternalServerError, "Could not load roles"); return }
	defer rows.Close()
	roles := []serverRolePublic{}
	for rows.Next() { var role serverRolePublic; var permissions string; if rows.Scan(&role.ID, &role.Name, &role.Description, &permissions, &role.IsDefault, &role.MemberCount) != nil || json.Unmarshal([]byte(permissions), &role.Permissions) != nil { s.detail(w, http.StatusInternalServerError, "Could not load roles"); return }; roles = append(roles, role) }
	s.json(w, http.StatusOK, roles)
}

func (s *Server) handleCreateServerRole(w http.ResponseWriter, r *http.Request, user userPublic) {
	if !hasPermission(user, permissionManageRoles) { s.detail(w, http.StatusForbidden, "Permission denied"); return }
	var payload createServerRoleRequest
	if s.decodeJSON(r, &payload) != nil { s.detail(w, http.StatusUnprocessableEntity, "Invalid request body"); return }
	payload.Name, payload.Description = strings.TrimSpace(payload.Name), strings.TrimSpace(payload.Description)
	permissions, valid := normalizeServerPermissions(payload.Permissions)
	if payload.Name == "" || len(payload.Name) > 60 || !valid { s.detail(w, http.StatusUnprocessableEntity, "Invalid role"); return }
	raw, _ := json.Marshal(permissions); id := uuid.NewString(); now := nowString()
	_, err := s.db.ExecContext(r.Context(), `INSERT INTO server_roles (id, family_id, name, description, permissions, is_default, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,FALSE,$6,$6)`, id, user.FamilyID, payload.Name, payload.Description, string(raw), now)
	if err != nil { s.detail(w, http.StatusConflict, "A role with that name already exists"); return }
	role, _ := s.loadServerRole(r.Context(), user.FamilyID, id); s.json(w, http.StatusCreated, role)
}

func (s *Server) handleUpdateServerRole(w http.ResponseWriter, r *http.Request, user userPublic) {
	if !hasPermission(user, permissionManageRoles) { s.detail(w, http.StatusForbidden, "Permission denied"); return }
	role, err := s.loadServerRole(r.Context(), user.FamilyID, chi.URLParam(r, "roleId")); if err != nil { s.detail(w, http.StatusNotFound, "Role not found"); return }
	var payload updateServerRoleRequest; if s.decodeJSON(r, &payload) != nil { s.detail(w, http.StatusUnprocessableEntity, "Invalid request body"); return }
	name, description, permissions := role.Name, role.Description, role.Permissions
	if payload.Name != nil { name = strings.TrimSpace(*payload.Name) }; if payload.Description != nil { description = strings.TrimSpace(*payload.Description) }
	if payload.Permissions != nil { var valid bool; permissions, valid = normalizeServerPermissions(*payload.Permissions); if !valid { s.detail(w, http.StatusUnprocessableEntity, "Invalid permissions"); return } }
	if name == "" || len(name) > 60 { s.detail(w, http.StatusUnprocessableEntity, "Invalid role name"); return }
	raw, _ := json.Marshal(permissions)
	if _, err = s.db.ExecContext(r.Context(), `UPDATE server_roles SET name=$1, description=$2, permissions=$3, updated_at=$4 WHERE id=$5 AND family_id=$6`, name, description, string(raw), nowString(), role.ID, user.FamilyID); err != nil { s.detail(w, http.StatusConflict, "A role with that name already exists"); return }
	updated, _ := s.loadServerRole(r.Context(), user.FamilyID, role.ID); s.json(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteServerRole(w http.ResponseWriter, r *http.Request, user userPublic) {
	if !hasPermission(user, permissionManageRoles) { s.detail(w, http.StatusForbidden, "Permission denied"); return }
	role, err := s.loadServerRole(r.Context(), user.FamilyID, chi.URLParam(r, "roleId")); if err != nil { s.detail(w, http.StatusNotFound, "Role not found"); return }
	if role.IsDefault { s.detail(w, http.StatusConflict, "Default roles cannot be deleted"); return }
	var replacement struct { ReplacementRoleID string `json:"replacementRoleId"` }; if s.decodeJSON(r, &replacement) != nil || replacement.ReplacementRoleID == role.ID { s.detail(w, http.StatusUnprocessableEntity, "Choose a replacement role"); return }
	if _, err = s.loadServerRole(r.Context(), user.FamilyID, replacement.ReplacementRoleID); err != nil { s.detail(w, http.StatusUnprocessableEntity, "Invalid replacement role"); return }
	tx, err := s.db.BeginTx(r.Context(), nil); if err != nil { s.detail(w, http.StatusInternalServerError, "Could not delete role"); return }; defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), `UPDATE users SET role_id=$1, role='member' WHERE family_id=$2 AND role_id=$3`, replacement.ReplacementRoleID, user.FamilyID, role.ID); err == nil { _, err = tx.ExecContext(r.Context(), `DELETE FROM server_roles WHERE id=$1 AND family_id=$2`, role.ID, user.FamilyID) }
	if err != nil || tx.Commit() != nil { s.detail(w, http.StatusInternalServerError, "Could not delete role"); return }; w.WriteHeader(http.StatusNoContent)
}

func (s *Server) assignServerRole(ctx context.Context, familyID, userID, roleID string) error {
	if _, err := s.loadServerRole(ctx, familyID, roleID); err != nil { return err }
	_, err := s.db.ExecContext(ctx, `UPDATE users SET role_id=$1, role=CASE WHEN $1 = family_id || ':admin' THEN 'admin' ELSE 'member' END WHERE id=$2 AND family_id=$3`, roleID, userID, familyID)
	return err
}
