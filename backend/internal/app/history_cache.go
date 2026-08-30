package app

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"stovo-messenger/backend/internal/ports"
)

const messageHistoryCacheTTL = time.Minute

type messageHistoryPage struct {
	Messages   []messagePublic `json:"messages"`
	NextBefore string          `json:"nextBefore"`
	HasMore    bool            `json:"hasMore"`
}

type historyCacheRevision struct {
	chat int64
	user int64
}

func newMessageHistoryPage(messages []messagePublic, hasMore bool) messageHistoryPage {
	page := messageHistoryPage{Messages: messages, HasMore: hasMore}
	if hasMore && len(messages) > 0 {
		page.NextBefore = messages[0].ID
	}
	return page
}

func historyCacheKey(chatID, userID string, chatRevision, userRevision int64) string {
	return fmt.Sprintf("chat:history:v1:%s:%d:%s:%d:latest-20", chatID, chatRevision, userID, userRevision)
}

func (s *Server) chatHistoryRevisions(ctx context.Context, chatID, userID string) historyCacheRevision {
	chatRevision := cacheRevision(ctx, s.cache, "chat:history:revision:"+chatID)
	userRevision := cacheRevision(ctx, s.cache, "chat:history:user-revision:"+userID+":"+chatID)
	return historyCacheRevision{chat: chatRevision, user: userRevision}
}

func cacheRevision(ctx context.Context, cacheStore ports.Cache, key string) int64 {
	value, err := cacheStore.Get(ctx, key)
	if err != nil {
		return 0
	}
	switch revision := value.(type) {
	case float64:
		return int64(revision)
	case int64:
		return revision
	case int:
		return int64(revision)
	default:
		return 0
	}
}

func (s *Server) loadCachedLatestHistory(ctx context.Context, chatID, userID string, revision historyCacheRevision) (messageHistoryPage, bool) {
	raw, err := s.cache.Get(ctx, historyCacheKey(chatID, userID, revision.chat, revision.user))
	if err != nil {
		return messageHistoryPage{}, false
	}
	if raw == nil {
		return messageHistoryPage{}, false
	}
	payload, err := json.Marshal(raw)
	if err != nil {
		return messageHistoryPage{}, false
	}
	var page messageHistoryPage
	if err := json.Unmarshal(payload, &page); err != nil {
		return messageHistoryPage{}, false
	}
	return page, true
}

func (s *Server) cacheLatestHistory(ctx context.Context, chatID, userID string, revision historyCacheRevision, page messageHistoryPage) {
	if err := s.cache.Set(ctx, historyCacheKey(chatID, userID, revision.chat, revision.user), page, int(messageHistoryCacheTTL.Seconds())); err != nil {
		s.logger.Warnf("history", "cache write failed chat_id=%s user_id=%s: %v", chatID, userID, err)
	}
}

func (s *Server) bumpChatHistoryRevision(ctx context.Context, chatID string) {
	if _, err := s.cache.Increment(ctx, "chat:history:revision:"+chatID, 0); err != nil {
		s.logger.Warnf("history", "cache invalidation failed chat_id=%s: %v", chatID, err)
	}
}

func (s *Server) bumpUserChatHistoryRevision(ctx context.Context, userID, chatID string) {
	if _, err := s.cache.Increment(ctx, "chat:history:user-revision:"+userID+":"+chatID, 0); err != nil {
		s.logger.Warnf("history", "user cache invalidation failed chat_id=%s user_id=%s: %v", chatID, userID, err)
	}
}
