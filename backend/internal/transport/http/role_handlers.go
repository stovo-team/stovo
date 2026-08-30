package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"strings"

	"stovo-messenger/backend/internal/features/roles"

	"github.com/go-chi/chi/v5"
)

// RoleActor is the transport representation of the authenticated actor. It
// deliberately contains only the authorization facts needed by these routes.
type RoleActor struct {
	FamilyID    string
	Owner       bool
	Permissions []string
}

func (a RoleActor) can(permission string) bool {
	if a.Owner {
		return true
	}
	for _, value := range a.Permissions {
		if value == permission {
			return true
		}
	}
	return false
}

type RolePublic struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions"`
	IsDefault   bool     `json:"isDefault"`
	MemberCount int      `json:"memberCount"`
}

func rolePublic(role roles.Role) RolePublic {
	return RolePublic{ID: role.ID, Name: role.Name, Description: role.Description, Permissions: role.Permissions, IsDefault: role.IsDefault, MemberCount: role.MemberCount}
}

type RoleOperations struct {
	List                   func(context.Context, string) ([]roles.Role, error)
	Get                    func(context.Context, string, string) (roles.Role, error)
	Create                 func(context.Context, roles.CreateCommand) error
	Update                 func(context.Context, roles.UpdateCommand) error
	DeleteReplacingMembers func(context.Context, string, string, string) error
	NewID                  func() string
	Now                    func() string
}

type RoleHandler struct{ operations RoleOperations }

func NewRoleHandler(operations RoleOperations) RoleHandler { return RoleHandler{operations} }

const manageRolesPermission = "manage_roles"

var validRolePermissions = map[string]struct{}{"manage_server": {}, "manage_roles": {}, "manage_members": {}, "manage_channels": {}, "manage_messages": {}, "manage_calls": {}, "manage_plans": {}, "manage_files": {}, "manage_integrations": {}}

func normalizeRolePermissions(values []string) ([]string, bool) {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if _, ok := validRolePermissions[value]; !ok {
			return nil, false
		}
		if _, exists := seen[value]; !exists {
			seen[value] = struct{}{}
			result = append(result, value)
		}
	}
	return result, true
}

func (h RoleHandler) List(w stdhttp.ResponseWriter, r *stdhttp.Request, actor RoleActor) {
	loaded, err := h.operations.List(r.Context(), actor.FamilyID)
	if err != nil {
		writeFamilyReadJSON(w, stdhttp.StatusInternalServerError, map[string]string{"detail": "Could not load roles"})
		return
	}
	result := make([]RolePublic, 0, len(loaded))
	for _, role := range loaded {
		result = append(result, rolePublic(role))
	}
	writeFamilyReadJSON(w, stdhttp.StatusOK, result)
}

func (h RoleHandler) Create(w stdhttp.ResponseWriter, r *stdhttp.Request, actor RoleActor) {
	if !actor.can(manageRolesPermission) {
		writeFamilyReadJSON(w, stdhttp.StatusForbidden, map[string]string{"detail": "Permission denied"})
		return
	}
	var payload struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Permissions []string `json:"permissions"`
	}
	if json.NewDecoder(r.Body).Decode(&payload) != nil {
		writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid request body"})
		return
	}
	payload.Name, payload.Description = strings.TrimSpace(payload.Name), strings.TrimSpace(payload.Description)
	permissions, valid := normalizeRolePermissions(payload.Permissions)
	if payload.Name == "" || len(payload.Name) > 60 || !valid {
		writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid role"})
		return
	}
	id := h.operations.NewID()
	if err := h.operations.Create(r.Context(), roles.CreateCommand{ID: id, FamilyID: actor.FamilyID, Name: payload.Name, Description: payload.Description, Permissions: permissions, CreatedAt: h.operations.Now()}); err != nil {
		writeFamilyReadJSON(w, stdhttp.StatusConflict, map[string]string{"detail": "A role with that name already exists"})
		return
	}
	role, _ := h.operations.Get(r.Context(), actor.FamilyID, id)
	writeFamilyReadJSON(w, stdhttp.StatusCreated, rolePublic(role))
}

func (h RoleHandler) Update(w stdhttp.ResponseWriter, r *stdhttp.Request, actor RoleActor) {
	if !actor.can(manageRolesPermission) {
		writeFamilyReadJSON(w, stdhttp.StatusForbidden, map[string]string{"detail": "Permission denied"})
		return
	}
	role, err := h.operations.Get(r.Context(), actor.FamilyID, chi.URLParam(r, "roleId"))
	if err != nil {
		writeFamilyReadJSON(w, stdhttp.StatusNotFound, map[string]string{"detail": "Role not found"})
		return
	}
	var payload struct {
		Name        *string   `json:"name"`
		Description *string   `json:"description"`
		Permissions *[]string `json:"permissions"`
	}
	if json.NewDecoder(r.Body).Decode(&payload) != nil {
		writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid request body"})
		return
	}
	name, description, permissions := role.Name, role.Description, role.Permissions
	if payload.Name != nil {
		name = strings.TrimSpace(*payload.Name)
	}
	if payload.Description != nil {
		description = strings.TrimSpace(*payload.Description)
	}
	if payload.Permissions != nil {
		var valid bool
		permissions, valid = normalizeRolePermissions(*payload.Permissions)
		if !valid {
			writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid permissions"})
			return
		}
	}
	if name == "" || len(name) > 60 {
		writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid role name"})
		return
	}
	if err = h.operations.Update(r.Context(), roles.UpdateCommand{FamilyID: actor.FamilyID, RoleID: role.ID, Name: name, Description: description, Permissions: permissions, UpdatedAt: h.operations.Now()}); err != nil {
		writeFamilyReadJSON(w, stdhttp.StatusConflict, map[string]string{"detail": "A role with that name already exists"})
		return
	}
	updated, _ := h.operations.Get(r.Context(), actor.FamilyID, role.ID)
	writeFamilyReadJSON(w, stdhttp.StatusOK, rolePublic(updated))
}

func (h RoleHandler) Delete(w stdhttp.ResponseWriter, r *stdhttp.Request, actor RoleActor) {
	if !actor.can(manageRolesPermission) {
		writeFamilyReadJSON(w, stdhttp.StatusForbidden, map[string]string{"detail": "Permission denied"})
		return
	}
	role, err := h.operations.Get(r.Context(), actor.FamilyID, chi.URLParam(r, "roleId"))
	if err != nil {
		writeFamilyReadJSON(w, stdhttp.StatusNotFound, map[string]string{"detail": "Role not found"})
		return
	}
	if role.IsDefault {
		writeFamilyReadJSON(w, stdhttp.StatusConflict, map[string]string{"detail": "Default roles cannot be deleted"})
		return
	}
	var replacement struct {
		ReplacementRoleID string `json:"replacementRoleId"`
	}
	if json.NewDecoder(r.Body).Decode(&replacement) != nil || replacement.ReplacementRoleID == role.ID {
		writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Choose a replacement role"})
		return
	}
	if _, err = h.operations.Get(r.Context(), actor.FamilyID, replacement.ReplacementRoleID); err != nil {
		writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid replacement role"})
		return
	}
	if err = h.operations.DeleteReplacingMembers(r.Context(), actor.FamilyID, role.ID, replacement.ReplacementRoleID); err != nil {
		writeFamilyReadJSON(w, stdhttp.StatusInternalServerError, map[string]string{"detail": "Could not delete role"})
		return
	}
	w.WriteHeader(stdhttp.StatusNoContent)
}
