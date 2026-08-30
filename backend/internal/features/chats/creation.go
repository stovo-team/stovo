package chats

import "context"

// CreateChat describes one atomic chat/membership/preference creation.
type CreateChat struct {
	ID, FamilyID, Type, CreatedBy, MediaVisibility, EncryptionProtocol, CreatedAt string
	Title                                                                         *string
	CommentsEnabled                                                               *bool
	MemberIDs                                                                     []string
	CreatePreferences                                                             bool
}

type CreationStore interface {
	CreateChat(context.Context, CreateChat) error
	AddMembers(context.Context, AddMembers) error
}

// AddMembers describes the memberships and user preferences that must be
// created together when people are invited into an existing chat.
type AddMembers struct {
	ChatID, CreatedAt string
	UserIDs           []string
}
type CreationService struct{ store CreationStore }

func NewCreationService(store CreationStore) *CreationService { return &CreationService{store: store} }
func (s *CreationService) Create(ctx context.Context, command CreateChat) error {
	return s.store.CreateChat(ctx, command)
}

func (s *CreationService) AddMembers(ctx context.Context, command AddMembers) error {
	return s.store.AddMembers(ctx, command)
}
