// Package identitysetup adapts the legacy Ent setup transaction to the
// identity-owned setup port.
package identitysetup

import (
	"context"

	featureidentity "stovo-messenger/backend/internal/features/identity"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) CompleteInitialSetup(ctx context.Context, command featureidentity.SetupCommand) error {
	return s.repository.CompleteSetup(ctx, setupParams(command))
}

func (s *Store) CreateAdditionalAdmin(ctx context.Context, command featureidentity.SetupCommand) error {
	_, err := s.repository.CreateAdminUser(ctx, setupParams(command))
	return err
}

func setupParams(command featureidentity.SetupCommand) repository.SetupParams {
	return repository.SetupParams{
		FamilyID: command.FamilyID, FamilyName: command.FamilyName, UserID: command.UserID,
		Username: command.Username, PasswordHash: command.PasswordHash, DisplayName: command.DisplayName,
		Role: command.Role, ChatID: command.ChatID, ChatTitle: command.ChatTitle,
		RefreshTokenID: command.RefreshTokenID, TokenHash: command.TokenHash, ExpiresAt: command.ExpiresAt,
		CreatedAt: command.CreatedAt, IPAddress: command.IPAddress,
	}
}
