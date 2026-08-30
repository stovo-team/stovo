// Package roles owns server-role queries and lifecycle commands.
package roles

import "context"

type Role struct {
	ID, Name, Description string
	Permissions           []string
	IsDefault             bool
	MemberCount           int
}

type CreateCommand struct {
	ID, FamilyID, Name, Description, CreatedAt string
	Permissions                                []string
}

type UpdateCommand struct {
	FamilyID, RoleID, Name, Description, UpdatedAt string
	Permissions                                    []string
}

type Store interface {
	UserRoleID(context.Context, string) (string, error)
	Get(context.Context, string, string) (Role, error)
	List(context.Context, string) ([]Role, error)
	Create(context.Context, CreateCommand) error
	Update(context.Context, UpdateCommand) error
	DeleteReplacingMembers(context.Context, string, string, string) error
	Assign(context.Context, string, string, string) error
}

type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store: store} }
func (s *Service) UserRoleID(ctx context.Context, userID string) (string, error) {
	return s.store.UserRoleID(ctx, userID)
}
func (s *Service) Get(ctx context.Context, familyID, roleID string) (Role, error) {
	return s.store.Get(ctx, familyID, roleID)
}
func (s *Service) List(ctx context.Context, familyID string) ([]Role, error) {
	return s.store.List(ctx, familyID)
}
func (s *Service) Create(ctx context.Context, command CreateCommand) error {
	return s.store.Create(ctx, command)
}
func (s *Service) Update(ctx context.Context, command UpdateCommand) error {
	return s.store.Update(ctx, command)
}
func (s *Service) DeleteReplacingMembers(ctx context.Context, familyID, roleID, replacementRoleID string) error {
	return s.store.DeleteReplacingMembers(ctx, familyID, roleID, replacementRoleID)
}
func (s *Service) Assign(ctx context.Context, familyID, userID, roleID string) error {
	return s.store.Assign(ctx, familyID, userID, roleID)
}
