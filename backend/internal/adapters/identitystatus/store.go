// Package identitystatus provides the Ent-backed setup-status read adapter.
package identitystatus

import (
	"context"

	"stovo-messenger/backend/ent/user"
	"stovo-messenger/backend/internal/features/identity"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) LoadSetupStatus(ctx context.Context) (identity.SetupStatus, error) {
	count, err := s.repository.Client.User.Query().Where(user.IsActiveEQ(1)).Count(ctx)
	if err != nil {
		return identity.SetupStatus{}, err
	}
	status := identity.SetupStatus{ActiveUserCount: count}
	if count == 0 {
		return status, nil
	}
	entry, err := s.repository.Client.Family.Query().First(ctx)
	if err == nil && entry != nil {
		name := entry.Name
		status.FamilyName = &name
	}
	return status, nil
}

var _ identity.SetupStatusStore = (*Store)(nil)
