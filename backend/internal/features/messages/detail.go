package messages

import "context"

// Detail is the persistence-neutral representation needed to render a message.
type Detail struct {
	ID, ChatID, FamilyID, SenderID, Type, EncryptionProtocol string
	ChatFound                                                bool
	Content, Ciphertext, Nonce, EncryptionMetadata           *string
	KeyVersion                                               *int
	ReplyToMessageID, ThreadRootMessageID                    *string
	MessageKind                                              string
	ForwardedFromMessageID, ForwardedFromChatID              *string
	CreatedAt, UpdatedAt                                     string
	DeletedAt                                                *string
	IsEdited                                                 bool
	SenderDisplayName                                        *string
}

type Status struct {
	UserID, Status, CreatedAt string
}

type Reaction struct {
	UserID, Emoji string
}

type Sender struct {
	ID          string
	DisplayName *string
}

// DetailStore deliberately exposes no ORM or transport types.
type DetailStore interface {
	LoadDetail(context.Context, string) (Detail, error)
	LoadSender(context.Context, string) (Sender, error)
	ListStatuses(context.Context, string) ([]Status, error)
	ListReactions(context.Context, string) ([]Reaction, error)
	ListAttachmentFileIDs(context.Context, string) ([]string, error)
}

type DetailService struct{ store DetailStore }

func NewDetailService(store DetailStore) *DetailService { return &DetailService{store: store} }
func (s *DetailService) Load(ctx context.Context, messageID string) (Detail, error) {
	return s.store.LoadDetail(ctx, messageID)
}
func (s *DetailService) Sender(ctx context.Context, messageID string) (Sender, error) {
	return s.store.LoadSender(ctx, messageID)
}
func (s *DetailService) Statuses(ctx context.Context, messageID string) ([]Status, error) {
	return s.store.ListStatuses(ctx, messageID)
}
func (s *DetailService) Reactions(ctx context.Context, messageID string) ([]Reaction, error) {
	return s.store.ListReactions(ctx, messageID)
}
func (s *DetailService) AttachmentFileIDs(ctx context.Context, messageID string) ([]string, error) {
	return s.store.ListAttachmentFileIDs(ctx, messageID)
}
