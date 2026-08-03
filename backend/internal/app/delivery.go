package app

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// ---- Call session Redis TTL helpers ----

func callSessionKey(id string) string { return "call:session:" + id }

func (s *Server) persistCallSession(ctx context.Context, session *callSession, ttl time.Duration) {
	data, err := json.Marshal(session)
	if err != nil {
		s.logger.Warnf("delivery", "persistCallSession marshal error: %v", err)
		return
	}
	if err := s.redis.Set(ctx, callSessionKey(session.ID), data, ttl).Err(); err != nil {
		s.logger.Warnf("delivery", "persistCallSession redis error room_id=%s: %v", session.ID, err)
	}
	// Keep chat-keyed copy for reconnect helpers that still look up by chat.
	if session.ChatID != "" && session.ChatID != session.ID {
		_ = s.redis.Set(ctx, callSessionKey(session.ChatID), data, ttl).Err()
	}
}

func (s *Server) deleteCallSession(ctx context.Context, id string) {
	if err := s.redis.Del(ctx, callSessionKey(id)).Err(); err != nil {
		s.logger.Warnf("delivery", "deleteCallSession redis error id=%s: %v", id, err)
	}
}

func (s *Server) loadCallSessionFromRedis(ctx context.Context, id string) *callSession {
	data, err := s.redis.Get(ctx, callSessionKey(id)).Bytes()
	if err == redis.Nil {
		return nil
	}
	if err != nil {
		s.logger.Warnf("delivery", "loadCallSession redis error id=%s: %v", id, err)
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
		SELECT id, COALESCE(chat_id, id), caller_id, callee_id, call_type, COALESCE(topology, 'mesh'), state, created_at
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
		var topology string
		if err := rows.Scan(&sess.ID, &sess.ChatID, &sess.CallerUserID, &sess.CalleeUserID, &sess.CallType, &topology, &sess.State, &createdAt); err != nil {
			continue
		}
		sess.Topology = callTopology(topology)
		if sess.Topology == "" {
			sess.Topology = callTopologyMesh
		}
		sess.CreatedAt = parseTime(createdAt)
		sess.ExpiresAt = sess.CreatedAt.Add(s.callTimeout)
		sess.Participants = map[string]*callParticipant{
			sess.CallerUserID: {UserID: sess.CallerUserID, Role: "host", State: participantRinging},
			sess.CalleeUserID: {UserID: sess.CalleeUserID, Role: "member", State: participantRinging},
		}
		partRows, err := s.query(`SELECT user_id, role, state, joined_at FROM call_participants WHERE room_id = ?`, sess.ID)
		if err == nil {
			for partRows.Next() {
				var userID, role, state string
				var joinedAt *time.Time
				if scanErr := partRows.Scan(&userID, &role, &state, &joinedAt); scanErr != nil {
					continue
				}
				p := &callParticipant{UserID: userID, Role: role, State: callParticipantState(state)}
				if joinedAt != nil {
					p.JoinedAt = joinedAt.UTC()
				}
				sess.Participants[userID] = p
			}
			partRows.Close()
		}
		ptr := &sess
		s.callByRoom[sess.ID] = ptr
		s.callByChat[sess.ChatID] = ptr
		for userID, p := range sess.Participants {
			if p != nil && p.State != participantLeft && p.State != participantDeclined {
				s.userActiveCall[userID] = sess.ID
			}
		}
	}
	count := len(s.callByRoom)
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
