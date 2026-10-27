// Package identitylogin maps identity login account queries to Ent-backed persistence.
package identitylogin

import (
	"context"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/internal/features/identity"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) LoginAccountByUsername(ctx context.Context, username string) (identity.LoginAccount, error) {
	user, err := s.repository.UserByUsernameFold(ctx, username)
	return mapLoginAccount(user, err)
}

func (s *Store) LoginAccountByID(ctx context.Context, id string) (identity.LoginAccount, error) {
	user, err := s.repository.UserByID(ctx, id)
	return mapLoginAccount(user, err)
}

func mapLoginAccount(user *ent.User, err error) (identity.LoginAccount, error) {
	if err != nil {
		return identity.LoginAccount{}, err
	}
	return identity.LoginAccount{
		ID: user.ID, FamilyID: user.FamilyID, Username: user.Username, PasswordHash: user.PasswordHash,
		DisplayName: user.DisplayName, Role: user.Role, IsActive: user.IsActive == 1,
		PublicKey: user.PublicKey, ProfilePhotoFileID: user.ProfilePhotoFileID,
		AvatarMode: user.ProfileAvatarMode, AvatarSymbolID: user.ProfileAvatarSymbolID, AvatarColorID: user.ProfileAvatarColorID, CreatedAt: user.CreatedAt,
		LastSeenAt: user.LastSeenAt, ProfileVisibility: user.ProfileVisibility,
		LastSeenVisibility: user.LastSeenVisibility, ReadReceiptsEnabled: user.ReadReceiptsEnabled,
		AudioCallSettings: user.AudioCallSettings, Email: user.Email, Bio: user.Bio, Timezone: user.Timezone,
	}, nil
}

var _ identity.LoginAccountStore = (*Store)(nil)
