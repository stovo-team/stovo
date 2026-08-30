// Package messagemutations adapts message edit/delete persistence to the
// messages feature, keeping repository structures outside HTTP handlers.
package messagemutations

import (
	"context"
	featuremessages "stovo-messenger/backend/internal/features/messages"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }
func (s *Store) EditPlain(ctx context.Context, edit featuremessages.PlainEdit) error {
	return s.repository.UpdateMessagePlainContent(ctx, edit.MessageID, edit.Content, edit.UpdatedAt)
}
func (s *Store) EditEncrypted(ctx context.Context, edit featuremessages.EncryptedEdit) error {
	return s.repository.UpdateMessageEncryptedContent(ctx, repository.UpdateMessageEncryptedContentParams{MessageID: edit.MessageID, Ciphertext: edit.Ciphertext, Nonce: edit.Nonce, KeyVersion: edit.KeyVersion, EncryptionMetadata: edit.EncryptionMetadata, UpdatedAt: edit.UpdatedAt})
}
func (s *Store) Delete(ctx context.Context, deletion featuremessages.Deletion) error {
	if deletion.ForUserOnly {
		return s.repository.UpsertMessageUserDeletion(ctx, deletion.MessageID, deletion.UserID, deletion.DeletedAt)
	}
	return s.repository.SoftDeleteMessage(ctx, deletion.MessageID, deletion.DeletedAt)
}
