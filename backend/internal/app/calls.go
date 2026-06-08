package app

import (
	"fmt"
	"time"
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
	ExpiresAt    time.Time
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
	return session, true
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
	return session, true
}

func callParticipant(session *callSession, userID string) bool {
	return session.CallerUserID == userID || session.CalleeUserID == userID
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
		payload := map[string]any{
			"chatId":   ended.ChatID,
			"callerId": ended.CallerUserID,
			"calleeId": ended.CalleeUserID,
			"reason":   "timeout",
			"endedAt":  nowString(),
		}
		_ = s.sockets.To("user:"+ended.CallerUserID).Emit("call:timeout", payload)
		_ = s.sockets.To("user:"+ended.CalleeUserID).Emit("call:timeout", payload)
		_ = s.sockets.To("user:"+ended.CallerUserID).Emit("call:ended", payload)
		_ = s.sockets.To("user:"+ended.CalleeUserID).Emit("call:ended", payload)
		s.logger.Warnf("realtime.call", "call timed out chat_id=%s caller=%s callee=%s", ended.ChatID, ended.CallerUserID, ended.CalleeUserID)
		go s.notifyCallMissed(ended.CalleeUserID, callerName, ended.ChatID)
	}()
}
