// Package identityprofiles maps identity profile commands to Ent persistence.
package identityprofiles

import (
	"context"

	"stovo-messenger/backend/internal/features/identity"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) UpdateProfile(ctx context.Context, userID string, patch identity.ProfilePatch) error {
	return s.repository.UpdateUserProfile(ctx, userID, repository.UpdateUserProfileParams{
		DisplayName: patch.DisplayName, PublicKey: patch.PublicKey, ProfilePhotoFileID: patch.ProfilePhotoFileID,
		ClearProfilePhoto: patch.ClearProfilePhoto, ProfileVisibility: patch.ProfileVisibility,
		LastSeenVisibility: patch.LastSeenVisibility, ReadReceiptsEnabled: patch.ReadReceiptsEnabled,
		Email: patch.Email, Bio: patch.Bio, Timezone: patch.Timezone,
	})
}

func (s *Store) UpdateLastSeen(ctx context.Context, userID, at string) error {
	return s.repository.UpdateUserLastSeen(ctx, userID, at)
}
