package roles

import (
	"context"
	"errors"
	"testing"
)

type storeFake struct {
	role                                  Role
	create                                CreateCommand
	update                                UpdateCommand
	familyID, roleID, replacement, userID string
	userRoleID                            string
	err                                   error
}

func (s *storeFake) UserRoleID(_ context.Context, userID string) (string, error) {
	s.userID = userID
	return s.userRoleID, s.err
}

func (s *storeFake) Get(_ context.Context, _, _ string) (Role, error) { return s.role, s.err }
func (s *storeFake) List(_ context.Context, _ string) ([]Role, error) { return []Role{s.role}, s.err }
func (s *storeFake) Create(_ context.Context, command CreateCommand) error {
	s.create = command
	return s.err
}
func (s *storeFake) Update(_ context.Context, command UpdateCommand) error {
	s.update = command
	return s.err
}
func (s *storeFake) DeleteReplacingMembers(_ context.Context, familyID, roleID, replacement string) error {
	s.familyID, s.roleID, s.replacement = familyID, roleID, replacement
	return s.err
}
func (s *storeFake) Assign(_ context.Context, familyID, userID, roleID string) error {
	s.familyID, s.userID, s.roleID = familyID, userID, roleID
	return s.err
}

func TestServiceDelegatesRoleCommands(t *testing.T) {
	store := &storeFake{role: Role{ID: "role"}}
	service := NewService(store)
	store.userRoleID = "role"
	if got, err := service.UserRoleID(context.Background(), "user"); err != nil || got != "role" || store.userID != "user" {
		t.Fatalf("user role ID=%q err=%v user=%q", got, err, store.userID)
	}
	if got, err := service.Get(context.Background(), "family", "role"); err != nil || got.ID != "role" {
		t.Fatalf("get=%+v err=%v", got, err)
	}
	if err := service.Create(context.Background(), CreateCommand{ID: "new"}); err != nil || store.create.ID != "new" {
		t.Fatalf("create=%+v err=%v", store.create, err)
	}
	if err := service.Update(context.Background(), UpdateCommand{RoleID: "role"}); err != nil || store.update.RoleID != "role" {
		t.Fatalf("update=%+v err=%v", store.update, err)
	}
	if err := service.DeleteReplacingMembers(context.Background(), "family", "role", "next"); err != nil || store.replacement != "next" {
		t.Fatalf("delete err=%v replacement=%q", err, store.replacement)
	}
	if err := service.Assign(context.Background(), "family", "user", "role"); err != nil || store.userID != "user" {
		t.Fatalf("assign err=%v user=%q", err, store.userID)
	}
	store.err = errors.New("store failed")
	if _, err := service.List(context.Background(), "family"); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}
