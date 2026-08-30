// Package familymembers implements family membership mutations with Ent.
package familymembers

import (
	"context"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) RemoveMember(ctx context.Context, userID, revokedAt string) error {
	return s.repository.WithTx(ctx, func(tx *ent.Tx) error {
		if err := s.repository.DeactivateUser(ctx, tx, userID); err != nil {
			return err
		}
		return s.repository.RevokeUserSessions(ctx, tx, userID, revokedAt)
	})
}
