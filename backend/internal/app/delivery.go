package app

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// ---- Call session Redis TTL helpers ----

func callSessionKey(chatID string) string { return "call:session:" + chatID }

func (s *Server) persistCallSession(ctx context.Context, session *callSession, ttl time.Duration) {
	data, err := json.Marshal(session)
	if err != nil {
		s.logger.Warnf("delivery", "persistCallSession marshal error: %v", err)
		return
	}
	if err := s.redis.Set(ctx, callSessionKey(session.ChatID), data, ttl).Err(); err != nil {
		s.logger.Warnf("delivery", "persistCallSession redis error chat_id=%s: %v", session.ChatID, err)
	}
}

func (s *Server) deleteCallSession(ctx context.Context, chatID string) {
	if err := s.redis.Del(ctx, callSessionKey(chatID)).Err(); err != nil {
		s.logger.Warnf("delivery", "deleteCallSession redis error chat_id=%s: %v", chatID, err)
	}
}

func (s *Server) loadCallSessionFromRedis(ctx context.Context, chatID string) *callSession {
	data, err := s.redis.Get(ctx, callSessionKey(chatID)).Bytes()
	if err == redis.Nil {
		return nil
	}
	if err != nil {
		s.logger.Warnf("delivery", "loadCallSession redis error chat_id=%s: %v", chatID, err)
		return nil
	}
	var session callSession
	if err := json.Unmarshal(data, &session); err != nil {
		return nil
	}
	return &session
}

func (s *Server) restoreCallSessions(ctx context.Context) {
	rows, err := s.query(`
		SELECT id, caller_id, callee_id, call_type, state, created_at
		FROM call_sessions
		WHERE ended_at IS NULL AND created_at > NOW() - INTERVAL '1 hour'
	`)
	if err != nil {
		s.logger.Warnf("delivery", "restoreCallSessions query error: %v", err)
		return
	}
	defer rows.Close()
	s.callMu.Lock()
	defer s.callMu.Unlock()
	for rows.Next() {
		var sess callSession
		var createdAt string
		if err := rows.Scan(&sess.ChatID, &sess.CallerUserID, &sess.CalleeUserID, &sess.CallType, &sess.State, &createdAt); err != nil {
			continue
		}
		sess.CreatedAt = parseTime(createdAt)
		sess.ExpiresAt = sess.CreatedAt.Add(s.callTimeout)
		ptr := &sess
		s.callByChat[sess.ChatID] = ptr
		s.userActiveCall[sess.CallerUserID] = sess.ChatID
		s.userActiveCall[sess.CalleeUserID] = sess.ChatID
	}
	count := len(s.callByChat)
	if count > 0 {
		s.logger.Infof("delivery", "restoreCallSessions restored %d active sessions", count)
	}
}

// ---- Pending event queue helpers ----

const (
	pendingEventTTL    = 5 * 60 // 300 seconds
	pendingEventMaxLen = 50
)

func pendingEventsKey(userID string) string { return "events:pending:" + userID }

type pendingEvent struct {
	Event   string          `json:"event"`
	Payload json.RawMessage `json:"payload"`
}

func (s *Server) enqueueEventForUser(ctx context.Context, userID string, event string, payload any) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	item, err := json.Marshal(pendingEvent{Event: event, Payload: raw})
	if err != nil {
		return
	}
	key := pendingEventsKey(userID)
	pipe := s.redis.Pipeline()
	pipe.LPush(ctx, key, item)
	pipe.LTrim(ctx, key, 0, int64(pendingEventMaxLen-1))
	pipe.Expire(ctx, key, time.Duration(pendingEventTTL)*time.Second)
	if _, err := pipe.Exec(ctx); err != nil {
		s.logger.Warnf("delivery", "enqueueEventForUser error user_id=%s: %v", userID, err)
	}
}

func (s *Server) drainPendingEvents(ctx context.Context, userID string) []pendingEvent {
	key := pendingEventsKey(userID)
	pipe := s.redis.Pipeline()
	lrange := pipe.LRange(ctx, key, 0, -1)
	pipe.Del(ctx, key)
	if _, err := pipe.Exec(ctx); err != nil {
		s.logger.Warnf("delivery", "drainPendingEvents error user_id=%s: %v", userID, err)
		return nil
	}
	raw := lrange.Val()
	events := make([]pendingEvent, 0, len(raw))
	for i := len(raw) - 1; i >= 0; i-- { // reverse: LPUSH makes newest first
		var ev pendingEvent
		if err := json.Unmarshal([]byte(raw[i]), &ev); err == nil {
			events = append(events, ev)
		}
	}
	return events
}

// ---- ntfy retry worker ----

type ntfyRetryItem struct {
	UserID  string
	Payload ntfyPayload
	Attempt int
}

func (s *Server) startNtfyRetryWorker(ctx context.Context) {
	delays := []time.Duration{5 * time.Second, 15 * time.Second, 30 * time.Second}
	for {
		select {
		case <-ctx.Done():
			return
		case item := <-s.ntfyRetryCh:
			delay := delays[0]
			if item.Attempt < len(delays) {
				delay = delays[item.Attempt]
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(delay):
			}
			retryCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := s.publishToNtfy(retryCtx, item.Payload)
			cancel()
			if err == nil {
				s.logger.Infof("delivery", "ntfy retry succeeded user_id=%s attempt=%d", item.UserID, item.Attempt+1)
				continue
			}
			next := item.Attempt + 1
			if next >= 3 {
				s.logger.Warnf("delivery", "ntfy retry exhausted user_id=%s after %d attempts", item.UserID, next)
				continue
			}
			item.Attempt = next
			select {
			case s.ntfyRetryCh <- item:
			default:
				s.logger.Warnf("delivery", "ntfy retry channel full, dropping user_id=%s", item.UserID)
			}
		}
	}
}
