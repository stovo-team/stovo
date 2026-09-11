package messagehistory

import (
	"context"
	featuremessages "stovo-messenger/backend/internal/features/messages"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }
func (s *Store) ActiveInChat(ctx context.Context, messageID, chatID string) (bool, error) {
	return s.repository.ActiveMessageExistsInChat(ctx, messageID, chatID)
}
func (s *Store) CreatedAtInChat(ctx context.Context, messageID, chatID string) (string, error) {
	return s.repository.MessageCreatedAtInChat(ctx, messageID, chatID)
}
func (s *Store) PageIDs(ctx context.Context, page featuremessages.HistoryPage) ([]string, error) {
	return s.repository.ListMessageIDsPage(ctx, repository.ListMessageIDsPageParams{ChatID: page.ChatID, ViewerID: page.ViewerID, BeforeCreatedAt: page.BeforeCreatedAt, ThreadRootMessageID: page.ThreadRootMessageID, ArchiveGroup: page.ArchiveGroup, Limit: page.Limit})
}
func (s *Store) ArchiveGroups(ctx context.Context, archiveChatID, viewerID string) ([]featuremessages.ArchiveGroup, error) {
	groups, err := s.repository.ListArchiveMessageGroups(ctx, archiveChatID, viewerID)
	if err != nil {
		return nil, err
	}
	result := make([]featuremessages.ArchiveGroup, len(groups))
	for index, group := range groups {
		result[index] = featuremessages.ArchiveGroup{SourceChatID: group.SourceChatID, MessageCount: group.Count}
	}
	return result, nil
}
func (s *Store) ThreadCounts(ctx context.Context, chatID string, rootIDs []string) (map[string]int, error) {
	return s.repository.CountThreadMessagesByRootIDs(ctx, chatID, rootIDs)
}

var _ featuremessages.HistoryStore = (*Store)(nil)
