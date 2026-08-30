package messagepersistence

import (
	"context"

	featuremessages "stovo-messenger/backend/internal/features/messages"
	"stovo-messenger/backend/internal/repository"
)

// Store adapts the legacy Ent-backed message transaction to the consumer-owned
// messages persistence port.
type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) CreateMessageBundle(ctx context.Context, bundle featuremessages.MessageBundle) error {
	return s.repository.CreateMessageBundle(ctx, repository.CreateMessageBundleParams{
		MessageID: bundle.MessageID, ChatID: bundle.ChatID, SenderID: bundle.SenderID,
		Type: bundle.Type, Content: bundle.Content, EncryptionProtocol: bundle.EncryptionProtocol,
		Ciphertext: bundle.Ciphertext, Nonce: bundle.Nonce, KeyVersion: bundle.KeyVersion,
		EncryptionMetadata: bundle.EncryptionMetadata, ReplyToMessageID: bundle.ReplyToMessageID,
		ThreadRootMessageID: bundle.ThreadRootMessageID, MessageKind: bundle.MessageKind,
		ForwardedFromMessageID: bundle.ForwardedFromMessageID, ForwardedFromChatID: bundle.ForwardedFromChatID,
		CreatedAt: bundle.CreatedAt, AttachmentFileIDs: bundle.AttachmentFileIDs,
		DeliveredRecipientIDs: bundle.DeliveredRecipientIDs,
	})
}

var _ featuremessages.MessagePersistenceStore = (*Store)(nil)
