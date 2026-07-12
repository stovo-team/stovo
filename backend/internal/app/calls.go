package app

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type callState string

const (
	callStateRinging    callState = "ringing"
	callStateConnecting callState = "connecting"
	callStateConnected  callState = "connected"
)

type callSession struct {
	ChatID       string
	CallerUserID string
	CalleeUserID string
	CallType     string // "audio" | "video"
	State        callState
	CreatedAt    time.Time
	ConnectedAt  time.Time
	ExpiresAt    time.Time
}

func callHistoryStatus(state callState, reason string) (string, bool) {
	if state == callStateConnected {
		return "completed", true
	}
	switch reason {
	case "timeout":
		return "missed", false
	case "declined":
		return "declined", false
	default:
		return "failed", false
	}
}

func (s *Server) startCallSession(chat chatPublic, callerUserID string, callType string) (*callSession, error) {
	if callType != "audio" && callType != "video" {
		callType = "audio"
	}
	if chat.Type != "direct" || len(chat.Members) != 2 {
		return nil, fmt.Errorf("calls are only available in direct messages")
	}
	calleeUserID := ""
	for _, member := range chat.Members {
		if member.ID != callerUserID {
			calleeUserID = member.ID
			break
		}
	}
	if calleeUserID == "" {
		return nil, fmt.Errorf("could not determine call participant")
	}

	s.callMu.Lock()
	defer s.callMu.Unlock()

	if _, exists := s.callByChat[chat.ID]; exists {
		return nil, fmt.Errorf("call already in progress for this chat")
	}
	if chatID, busy := s.userActiveCall[callerUserID]; busy && chatID != chat.ID {
		return nil, fmt.Errorf("you are already in another call")
	}
	if chatID, busy := s.userActiveCall[calleeUserID]; busy && chatID != chat.ID {
		return nil, fmt.Errorf("participant is busy in another call")
	}

	now := time.Now().UTC()
	session := &callSession{
		ChatID:       chat.ID,
		CallerUserID: callerUserID,
		CalleeUserID: calleeUserID,
		CallType:     callType,
		State:        callStateRinging,
		CreatedAt:    now,
		ExpiresAt:    now.Add(s.callTimeout),
	}
	s.callByChat[chat.ID] = session
	s.userActiveCall[callerUserID] = chat.ID
	s.userActiveCall[calleeUserID] = chat.ID
	if s.db != nil {
		go func(sess *callSession) {
			ctx := context.Background()
			s.exec(`INSERT INTO call_sessions (id, caller_id, callee_id, call_type, state, created_at)
				VALUES (?, ?, ?, ?, ?, NOW())`,
				sess.ChatID, sess.CallerUserID, sess.CalleeUserID, sess.CallType, string(sess.State))
			s.persistCallSession(ctx, sess, 60*time.Second)
		}(session)
	}
	return session, nil
}

func (s *Server) getCallSession(chatID string) (*callSession, bool) {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	session, ok := s.callByChat[chatID]
	return session, ok
}

func (s *Server) setCallSessionState(chatID string, state callState) (*callSession, bool) {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	session, ok := s.callByChat[chatID]
	if !ok {
		return nil, false
	}
	session.State = state
	if state == callStateConnected && session.ConnectedAt.IsZero() {
		session.ConnectedAt = time.Now().UTC()
	}
	go func(sess *callSession, st callState) {
		ctx := context.Background()
		s.exec(`UPDATE call_sessions SET state = ? WHERE id = ?`, string(st), sess.ChatID)
		ttl := 60 * time.Second
		if st == callStateConnecting || st == callStateConnected {
			ttl = 3600 * time.Second
		}
		s.persistCallSession(ctx, sess, ttl)
	}(session, state)
	return session, true
}

func (s *Server) recordCallHistory(session *callSession, reason string) {
	status, completed := callHistoryStatus(session.State, reason)
	record := callHistoryPublic{
		Status:   status,
		CallType: session.CallType,
		CallerID: session.CallerUserID,
		CalleeID: session.CalleeUserID,
	}
	if completed {
		startedAt := session.ConnectedAt
		if startedAt.IsZero() {
			startedAt = session.CreatedAt
		}
		duration := int(time.Since(startedAt).Seconds())
		if duration < 0 {
			duration = 0
		}
		record.DurationSeconds = &duration
	}
	metadata, err := json.Marshal(record)
	if err != nil {
		s.logger.Warnf("realtime.call", "call history serialization failed chat_id=%s error=%v", session.ChatID, err)
		return
	}
	messageID := uuid.NewString()
	now := nowString()
	if _, err := s.exec(`
		INSERT INTO messages (id, chat_id, sender_id, type, content, encryption_protocol, encryption_metadata, message_kind, created_at, updated_at)
		VALUES (?, ?, ?, 'call', NULL, 'legacy_plaintext', ?, 'chat', ?, ?)
	`, messageID, session.ChatID, session.CallerUserID, string(metadata), now, now); err != nil {
		s.logger.Warnf("realtime.call", "call history insert failed chat_id=%s error=%v", session.ChatID, err)
		return
	}
	if _, err := s.exec(`INSERT INTO message_statuses (message_id, user_id, status, created_at) VALUES (?, ?, 'sent', ?)`, messageID, session.CallerUserID, now); err != nil {
		s.logger.Warnf("realtime.call", "call history status insert failed message_id=%s error=%v", messageID, err)
	}
	if _, err := s.exec(`UPDATE chats SET updated_at = ? WHERE id = ?`, now, session.ChatID); err != nil {
		s.logger.Warnf("realtime.call", "call history chat update failed chat_id=%s error=%v", session.ChatID, err)
	}
	caller, err := s.getUserByID(session.CallerUserID)
	if err != nil {
		s.logger.Warnf("realtime.call", "call history caller lookup failed caller_id=%s error=%v", session.CallerUserID, err)
		return
	}
	chat, err := s.buildChatPublic(session.ChatID, caller)
	if err != nil {
		s.logger.Warnf("realtime.call", "call history chat lookup failed chat_id=%s error=%v", session.ChatID, err)
		return
	}
	message, err := s.buildMessage(messageID, session.CallerUserID)
	if err != nil {
		s.logger.Warnf("realtime.call", "call history message lookup failed message_id=%s error=%v", messageID, err)
		return
	}
	s.emitMessageNew(chat, message)
}

func (s *Server) endCallSession(chatID string) (*callSession, bool) {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	session, ok := s.callByChat[chatID]
	if !ok {
		return nil, false
	}
	delete(s.callByChat, chatID)
	delete(s.userActiveCall, session.CallerUserID)
	delete(s.userActiveCall, session.CalleeUserID)
	if s.db != nil {
		go func(chatID string, created time.Time) {
			ctx := context.Background()
			dur := int(time.Since(created).Seconds())
			s.exec(`UPDATE call_sessions SET state = 'ended', ended_at = NOW(), duration_s = ? WHERE id = ?`, dur, chatID)
			s.deleteCallSession(ctx, chatID)
		}(chatID, session.CreatedAt)
	}
	return session, true
}

func (s *Server) endCallForUser(userID string) (*callSession, bool) {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	chatID, ok := s.userActiveCall[userID]
	if !ok {
		return nil, false
	}
	session, exists := s.callByChat[chatID]
	if !exists {
		delete(s.userActiveCall, userID)
		return nil, false
	}
	delete(s.callByChat, chatID)
	delete(s.userActiveCall, session.CallerUserID)
	delete(s.userActiveCall, session.CalleeUserID)
	if s.db != nil {
		go func(chatID string, created time.Time) {
			ctx := context.Background()
			dur := int(time.Since(created).Seconds())
			s.exec(`UPDATE call_sessions SET state = 'ended', ended_at = NOW(), duration_s = ? WHERE id = ?`, dur, chatID)
			s.deleteCallSession(ctx, chatID)
		}(session.ChatID, session.CreatedAt)
	}
	return session, true
}

func callParticipant(session *callSession, userID string) bool {
	return session.CallerUserID == userID || session.CalleeUserID == userID
}

func (s *Server) userHasActiveCall(userID string) bool {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	_, ok := s.userActiveCall[userID]
	return ok
}

// getActiveCallSessionForUser returns any in-memory call session for userID.
func (s *Server) getActiveCallSessionForUser(userID string) *callSession {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	chatID, ok := s.userActiveCall[userID]
	if !ok {
		return nil
	}
	session, exists := s.callByChat[chatID]
	if !exists {
		return nil
	}
	return session
}

// getRingingSessionForUser returns the active ringing call session for a user
// (where the user is the callee and the call is still in ringing state), or
// nil if no such session exists. This is used to re-emit call:ringing to a
// newly reconnected socket so the receiver never misses an incoming call.
func (s *Server) getRingingSessionForUser(userID string) *callSession {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	chatID, ok := s.userActiveCall[userID]
	if !ok {
		return nil
	}
	session, exists := s.callByChat[chatID]
	if !exists || session.State != callStateRinging {
		return nil
	}
	return session
}

func (s *Server) scheduleCallTimeout(chatID string, expiresAt time.Time, callerName string) {
	go func() {
		time.Sleep(time.Until(expiresAt))
		session, ok := s.getCallSession(chatID)
		if !ok {
			return
		}
		if !session.ExpiresAt.Equal(expiresAt) || session.State != callStateRinging {
			return
		}
		ended, endedOK := s.endCallSession(chatID)
		if !endedOK {
			return
		}
		s.recordCallHistory(ended, "timeout")
		payload := map[string]any{
			"chatId":           ended.ChatID,
			"callerId":         ended.CallerUserID,
			"calleeId":         ended.CalleeUserID,
			"reason":           "timeout",
			"endedAt":          nowString(),
			"sessionStartedAt": ended.CreatedAt.Format(time.RFC3339Nano),
		}
		s.emitCallToUser(ended.CallerUserID, "call:timeout", payload)
		s.emitCallToUser(ended.CalleeUserID, "call:timeout", payload)
		s.emitCallToUser(ended.CallerUserID, "call:ended", payload)
		s.emitCallToUser(ended.CalleeUserID, "call:ended", payload)
		s.logger.Warnf("realtime.call", "call timed out chat_id=%s caller=%s callee=%s", ended.ChatID, ended.CallerUserID, ended.CalleeUserID)
		go s.notifyCallMissed(ended.CalleeUserID, callerName, ended.ChatID)
	}()
}
