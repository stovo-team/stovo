package chats

import "context"

// ArchiveStore is the chat feature's persistence port for a user's personal
// archive lookup.
type ArchiveStore interface {
	FindArchive(context.Context, string, string) (string, error)
	EnsureArchive(context.Context, CreateChat) (string, error)
	MediaApprovalUserIDs(context.Context, string) ([]string, error)
	DirectChatIDs(context.Context) ([]string, error)
	Members(context.Context, string) ([]Member, error)
	ConnectorAlias(context.Context, string) (string, error)
	LastMessagePreview(context.Context, string) (MessagePreview, error)
}

type Member struct {
	ID, DisplayName, Username, Role, LastSeenVisibility string
	PublicKey, LastSeenAt, ProfilePhotoFileID           *string
	AvatarMode, AvatarSymbolID, AvatarColorID            *string
}

type MessagePreview struct {
	ID, SenderID, Type, CreatedAt string
	SenderName                    *string
	Content                       *string
	EncryptionProtocol            string
	Ciphertext, Nonce             *string
	AttachmentCount               int
}

type ArchiveService struct{ store ArchiveStore }

func NewArchiveService(store ArchiveStore) *ArchiveService { return &ArchiveService{store: store} }
func (s *ArchiveService) Existing(ctx context.Context, familyID, userID string) (string, error) {
	return s.store.FindArchive(ctx, familyID, userID)
}

func (s *ArchiveService) Ensure(ctx context.Context, command CreateChat) (string, error) {
	return s.store.EnsureArchive(ctx, command)
}

func (s *ArchiveService) MediaApprovalUserIDs(ctx context.Context, chatID string) ([]string, error) {
	return s.store.MediaApprovalUserIDs(ctx, chatID)
}

func (s *ArchiveService) DirectChatIDs(ctx context.Context) ([]string, error) {
	return s.store.DirectChatIDs(ctx)
}
func (s *ArchiveService) Members(ctx context.Context, chatID string) ([]Member, error) {
	return s.store.Members(ctx, chatID)
}
func (s *ArchiveService) ConnectorAlias(ctx context.Context, actorID string) (string, error) {
	return s.store.ConnectorAlias(ctx, actorID)
}
func (s *ArchiveService) LastMessagePreview(ctx context.Context, chatID string) (MessagePreview, error) {
	return s.store.LastMessagePreview(ctx, chatID)
}
