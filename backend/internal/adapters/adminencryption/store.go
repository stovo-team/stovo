// Package adminencryption adapts encryption-setting persistence to administration.
package adminencryption

import (
	"context"

	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) SaveEncryptionProtocol(ctx context.Context, familyID, protocol, updatedAt string) error {
	return s.repository.UpdateFamilyEncryptionProtocol(ctx, familyID, protocol, updatedAt)
}
