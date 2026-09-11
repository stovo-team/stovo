package messages

import "context"

// HistoryPage is persistence-neutral pagination input for message history.
type HistoryPage struct {
	ChatID, ViewerID, BeforeCreatedAt, ThreadRootMessageID, ArchiveGroup string
	Limit                                                                int
}

// ArchiveGroup summarizes archived copies by the chat from which they were
// forwarded. Direct entries deliberately have no group: the client presents
// those as the user's My Notes collection.
type ArchiveGroup struct {
	SourceChatID string
	MessageCount int
}

type HistoryStore interface {
	ActiveInChat(context.Context, string, string) (bool, error)
	CreatedAtInChat(context.Context, string, string) (string, error)
	PageIDs(context.Context, HistoryPage) ([]string, error)
	ArchiveGroups(context.Context, string, string) ([]ArchiveGroup, error)
	ThreadCounts(context.Context, string, []string) (map[string]int, error)
}

type HistoryService struct{ store HistoryStore }

func NewHistoryService(store HistoryStore) *HistoryService { return &HistoryService{store: store} }
func (s *HistoryService) ActiveInChat(ctx context.Context, messageID, chatID string) (bool, error) {
	return s.store.ActiveInChat(ctx, messageID, chatID)
}
func (s *HistoryService) CreatedAt(ctx context.Context, messageID, chatID string) (string, error) {
	return s.store.CreatedAtInChat(ctx, messageID, chatID)
}
func (s *HistoryService) PageIDs(ctx context.Context, page HistoryPage) ([]string, error) {
	return s.store.PageIDs(ctx, page)
}
func (s *HistoryService) ArchiveGroups(ctx context.Context, archiveChatID, viewerID string) ([]ArchiveGroup, error) {
	return s.store.ArchiveGroups(ctx, archiveChatID, viewerID)
}
func (s *HistoryService) ThreadCounts(ctx context.Context, chatID string, rootIDs []string) (map[string]int, error) {
	return s.store.ThreadCounts(ctx, chatID, rootIDs)
}
