package app

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
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
	chatRevision, err := s.redis.Get(ctx, "chat:history:revision:"+chatID).Int64()
	if err != nil {
		chatRevision = 0
	}
	userRevision, err := s.redis.Get(ctx, "chat:history:user-revision:"+userID+":"+chatID).Int64()
	if err != nil {
		userRevision = 0
	}
	return historyCacheRevision{chat: chatRevision, user: userRevision}
}

func (s *Server) loadCachedLatestHistory(ctx context.Context, chatID, userID string, revision historyCacheRevision) (messageHistoryPage, bool) {
	raw, err := s.redis.Get(ctx, historyCacheKey(chatID, userID, revision.chat, revision.user)).Bytes()
	if err != nil {
		return messageHistoryPage{}, false
	}
	var page messageHistoryPage
	if err := json.Unmarshal(raw, &page); err != nil {
		return messageHistoryPage{}, false
	}
	return page, true
}

func (s *Server) cacheLatestHistory(ctx context.Context, chatID, userID string, revision historyCacheRevision, page messageHistoryPage) {
	raw, err := json.Marshal(page)
	if err != nil {
		return
	}
	if err := s.redis.Set(ctx, historyCacheKey(chatID, userID, revision.chat, revision.user), raw, messageHistoryCacheTTL).Err(); err != nil {
		s.logger.Warnf("history", "cache write failed chat_id=%s user_id=%s: %v", chatID, userID, err)
	}
}

func (s *Server) bumpChatHistoryRevision(ctx context.Context, chatID string) {
	if err := s.redis.Incr(ctx, "chat:history:revision:"+chatID).Err(); err != nil {
		s.logger.Warnf("history", "cache invalidation failed chat_id=%s: %v", chatID, err)
	}
}

func (s *Server) bumpUserChatHistoryRevision(ctx context.Context, userID, chatID string) {
	if err := s.redis.Incr(ctx, "chat:history:user-revision:"+userID+":"+chatID).Err(); err != nil {
		s.logger.Warnf("history", "user cache invalidation failed chat_id=%s user_id=%s: %v", chatID, userID, err)
	}
}
