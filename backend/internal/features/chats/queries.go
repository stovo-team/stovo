package chats

import "context"

// ChatDetails is the persistence-neutral chat projection required by inbound
// transports when assembling a chat response for one member.
type ChatDetails struct {
	ID, FamilyID, Type, MediaVisibility, EncryptionProtocol string
	Title, Description, CreatedBy, ChatPhotoFileID          *string
	CreatedAt, UpdatedAt, PinPermission                     string
	CommentsEnabled                                         bool
	MessageDelaySeconds                                     int
	Preference                                              *ChatPreference
}

// ChatPreference is the per-member portion of a chat projection.
type ChatPreference struct {
	IsMuted, IsPinned, IsFavorite bool
	WallpaperFileID               *string
}

// QueryStore is owned by the chats feature. Concrete persistence adapters map
// database entities into the feature's projection before crossing this port.
type QueryStore interface {
	GetForMember(context.Context, string, string) (ChatDetails, error)
	ListForUser(context.Context, string) ([]ChatDetails, error)
	Type(context.Context, string) (string, error)
}

type QueryService struct{ store QueryStore }

func NewQueryService(store QueryStore) *QueryService { return &QueryService{store: store} }

func (s *QueryService) GetForMember(ctx context.Context, chatID, userID string) (ChatDetails, error) {
	return s.store.GetForMember(ctx, chatID, userID)
}

func (s *QueryService) ListForUser(ctx context.Context, userID string) ([]ChatDetails, error) {
	return s.store.ListForUser(ctx, userID)
}

func (s *QueryService) Type(ctx context.Context, chatID string) (string, error) {
	return s.store.Type(ctx, chatID)
}
