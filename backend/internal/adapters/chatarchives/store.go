package chatarchives

import (
	"context"
	featurechats "stovo-messenger/backend/internal/features/chats"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }
func (s *Store) FindArchive(ctx context.Context, familyID, userID string) (string, error) {
	return s.repository.FindArchiveChatID(ctx, familyID, userID)
}
func (s *Store) MediaApprovalUserIDs(ctx context.Context, chatID string) ([]string, error) {
	return s.repository.ListMediaApprovalUserIDs(ctx, chatID)
}
func (s *Store) DirectChatIDs(ctx context.Context) ([]string, error) {
	return s.repository.ListDirectChatIDs(ctx)
}
func (s *Store) Members(ctx context.Context, chatID string) ([]featurechats.Member, error) {
	users, err := s.repository.ListActiveChatMemberUsers(ctx, chatID)
	if err != nil {
		return nil, err
	}
	out := make([]featurechats.Member, 0, len(users))
	for _, u := range users {
		out = append(out, featurechats.Member{ID: u.ID, DisplayName: u.DisplayName, Username: u.Username, Role: u.Role, PublicKey: u.PublicKey, LastSeenVisibility: u.LastSeenVisibility, LastSeenAt: u.LastSeenAt, ProfilePhotoFileID: u.ProfilePhotoFileID})
	}
	return out, nil
}
func (s *Store) ConnectorAlias(ctx context.Context, actorID string) (string, error) {
	return s.repository.MCPConnectorAliasForActor(ctx, actorID)
}
func (s *Store) LastMessagePreview(ctx context.Context, chatID string) (featurechats.MessagePreview, error) {
	p, err := s.repository.GetLastMessagePreview(ctx, chatID)
	if err != nil {
		return featurechats.MessagePreview{}, err
	}
	return featurechats.MessagePreview{ID: p.ID, SenderID: p.SenderID, SenderName: p.SenderName, Type: p.Type, Content: p.Content, CreatedAt: p.CreatedAt, AttachmentCount: p.AttachmentCount}, nil
}

var _ featurechats.ArchiveStore = (*Store)(nil)
