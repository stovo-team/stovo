package identitysessions

import (
	"context"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/internal/features/identity"
	"stovo-messenger/backend/internal/repository"
)

type Writer struct{ store *repository.Store }

func NewWriter(store *repository.Store) *Writer { return &Writer{store: store} }
func (w *Writer) SessionByHash(ctx context.Context, hash string) (identity.RefreshSession, error) {
	token, err := w.store.RefreshTokenByHash(ctx, hash)
	if err != nil {
		return identity.RefreshSession{}, err
	}
	return identity.RefreshSession{UserID: token.UserID, ExpiresAt: token.ExpiresAt, Revoked: token.RevokedAt != nil}, nil
}
func (w *Writer) CreateSession(ctx context.Context, session identity.PersistedSession) error {
	return w.store.WithTx(ctx, func(tx *ent.Tx) error {
		return w.store.CreateRefreshToken(ctx, tx, repository.CreateRefreshTokenParams{ID: session.ID, UserID: session.UserID, TokenHash: session.TokenHash, ExpiresAt: session.ExpiresAt, CreatedAt: session.CreatedAt, IPAddress: session.IPAddress})
	})
}
func (w *Writer) RotateSession(ctx context.Context, session identity.RotatedSession) error {
	return w.store.RotateRefreshToken(ctx, repository.RotateRefreshTokenParams{OldTokenHash: session.OldTokenHash, NewID: session.New.ID, UserID: session.New.UserID, NewTokenHash: session.New.TokenHash, NewExpiresAt: session.New.ExpiresAt, CreatedAt: session.New.CreatedAt, IPAddress: session.New.IPAddress, RevokedAt: session.RevokedAt})
}
func (w *Writer) RevokeSession(ctx context.Context, hash, revokedAt string) error {
	return w.store.RevokeRefreshTokenByHash(ctx, hash, revokedAt)
}
func (w *Writer) ChangePassword(ctx context.Context, change identity.PasswordChange) error {
	return w.store.UpdateUserPasswordAndRevokeOtherSessions(ctx, change.UserID, change.PasswordHash, change.CurrentTokenHash, change.RevokedAt)
}
