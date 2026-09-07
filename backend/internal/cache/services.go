package cache

import (
	"context"
	"fmt"
)

type PresenceService struct {
	cache CachingService
}

func NewPresenceService(cache CachingService) *PresenceService {
	return &PresenceService{cache: cache}
}

func (s *PresenceService) MarkOnline(ctx context.Context, userID string, ttlSeconds int) error {
	return s.cache.Set(ctx, fmt.Sprintf("presence:user:%s", userID), map[string]string{"status": "online"}, ttlSeconds)
}

func (s *PresenceService) MarkOffline(ctx context.Context, userID string) error {
	return s.cache.Delete(ctx, fmt.Sprintf("presence:user:%s", userID))
}

func (s *PresenceService) IsOnline(ctx context.Context, userID string) (bool, error) {
	return s.cache.Exists(ctx, fmt.Sprintf("presence:user:%s", userID))
}

type TypingService struct {
	cache CachingService
}

func NewTypingService(cache CachingService) *TypingService {
	return &TypingService{cache: cache}
}

func (s *TypingService) StartTyping(ctx context.Context, chatID string, userID string, ttlSeconds int) error {
	return s.cache.Set(ctx, fmt.Sprintf("typing:chat:%s:user:%s", chatID, userID), map[string]bool{"isTyping": true}, ttlSeconds)
}

func (s *TypingService) StopTyping(ctx context.Context, chatID string, userID string) error {
	return s.cache.Delete(ctx, fmt.Sprintf("typing:chat:%s:user:%s", chatID, userID))
}

type RateLimitExceededError struct {
	Message string
}

func (e RateLimitExceededError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return "Rate limit exceeded"
}

type RateLimitService struct {
	cache CachingService
}

func NewRateLimitService(cache CachingService) *RateLimitService {
	return &RateLimitService{cache: cache}
}

func (s *RateLimitService) CheckFixedWindow(ctx context.Context, key string, limit int, windowSeconds int) (int64, error) {
	count, err := s.cache.Increment(ctx, key, windowSeconds)
	if err != nil {
		return 0, err
	}
	if count > int64(limit) {
		return count, RateLimitExceededError{Message: "Rate limit exceeded"}
	}
	return count, nil
}

func (s *RateLimitService) CheckLogin(ctx context.Context, ipAddress string) (int64, error) {
	if ipAddress == "" {
		ipAddress = "unknown"
	}
	return s.CheckFixedWindow(ctx, fmt.Sprintf("rate-limit:login:%s", ipAddress), 10, 15*60)
}

func (s *RateLimitService) CheckMessage(ctx context.Context, userID string) (int64, error) {
	return s.CheckFixedWindow(ctx, fmt.Sprintf("rate-limit:message:%s", userID), 60, 60)
}
