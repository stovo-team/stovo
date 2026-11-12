package messages

import (
	"context"
	"errors"
	"time"
)

var (
	ErrOperationConflict   = errors.New("operation ID was already used with a different request")
	ErrOperationProcessing = errors.New("operation is still processing")
)

// SyncedMessage is the persistence-neutral portion of a fully resolved
// message. The transport keeps request decoding and response serialization;
// the store owns the atomic message, sync-event, outbox, and idempotency write.
type SyncedMessage struct {
	ID, ChatID, SenderID, Type, EncryptionProtocol, MessageKind string
	Content, Ciphertext, Nonce, EncryptionMetadata              *string
	KeyVersion                                                  *int
	ReplyToMessageID, ThreadRootMessageID                       *string
	SourceConnectionID, SourceOperationID, SourceOrigin         string
	SourceRevision                                              int64
	SourceContentHash                                           []byte
	SourceFinal                                                 bool
	AttachmentIDs                                               []string
	CreatedAt                                                   time.Time
}

type CreateSyncedMessage struct {
	ActorID, FamilyID, ChatID, OperationID, RequestHash string
	Message                                             SyncedMessage
	OnlineRecipientIDs, RecipientIDs                    []string
	ResponsePayload                                     []byte
}

type CreateSyncedMessageResult struct {
	ResponsePayload []byte
	Replayed        bool
}

// SyncedMessageStore is a feature-owned atomic persistence boundary. It
// deliberately returns serialized opaque response bytes so HTTP response types
// and database transaction handles never cross into the feature core.
type SyncedMessageStore interface {
	CreateSyncedMessage(context.Context, CreateSyncedMessage) (CreateSyncedMessageResult, error)
}

type SyncedMessageService struct{ store SyncedMessageStore }

func NewSyncedMessageService(store SyncedMessageStore) *SyncedMessageService {
	return &SyncedMessageService{store: store}
}

func (s *SyncedMessageService) Create(ctx context.Context, command CreateSyncedMessage) (CreateSyncedMessageResult, error) {
	return s.store.CreateSyncedMessage(ctx, command)
}
