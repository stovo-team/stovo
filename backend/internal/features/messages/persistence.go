package messages

import "context"

// MessageBundle is the persistence-neutral unit that makes a sent message
// durable together with its statuses, attachments, and chat activity update.
// The store owns the transaction so no Ent transaction crosses into the
// feature or transport layers.
type MessageBundle struct {
	MessageID, ChatID, SenderID, Type, EncryptionProtocol, MessageKind, CreatedAt string
	Content, Ciphertext, Nonce, EncryptionMetadata                                *string
	KeyVersion                                                                    *int
	ReplyToMessageID, ThreadRootMessageID                                         *string
	ForwardedFromMessageID, ForwardedFromChatID                                   *string
	AttachmentFileIDs, DeliveredRecipientIDs                                      []string
}

type MessagePersistenceStore interface {
	CreateMessageBundle(context.Context, MessageBundle) error
}

type PersistenceService struct{ store MessagePersistenceStore }

func NewPersistenceService(store MessagePersistenceStore) *PersistenceService {
	return &PersistenceService{store: store}
}

func (s *PersistenceService) Create(ctx context.Context, bundle MessageBundle) error {
	return s.store.CreateMessageBundle(ctx, bundle)
}
