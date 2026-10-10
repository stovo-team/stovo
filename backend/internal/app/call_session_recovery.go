package app

import (
	"context"
	"errors"
	"fmt"
	"time"

	"stovo-messenger/backend/internal/runtime"
)

var errCallUserAlreadyInAnotherCall = errors.New("you are already in another call")

func (s *Server) startCallSession(chat chatPublic, callerUserID string, callType string, inviteUserIDs []string) (*callSession, error) {
	session, err := s.startCallSessionOnce(chat, callerUserID, callType, inviteUserIDs)
	if !errors.Is(err, errCallUserAlreadyInAnotherCall) {
		return session, err
	}
	if _, released, _ := s.releasePreviousCallForRetry(callerUserID); !released {
		return nil, err
	}
	return s.startCallSessionOnce(chat, callerUserID, callType, inviteUserIDs)
}

func (s *Server) checkCallConflicts(callerUserID, chatID string, invitees []string) error {
	conflict := s.calls.DetectCallConflictLocked(chatID, callerUserID, invitees, func(session *callSession) string {
		if session == nil {
			return ""
		}
		return session.ChatID
	})
	if conflict == nil {
		return nil
	}
	if conflict.Kind == runtime.CallConflictInitiator {
		// DetectCallConflictLocked reports the caller first. Check invitees too
		// before recovering the caller's old session, so a request that cannot
		// succeed does not end a valid call the caller is already in.
		for _, inviteeID := range invitees {
			roomID, busy := s.calls.ActiveRoomLocked(inviteeID)
			if !busy {
				continue
			}
			inviteeSession, found := s.calls.ByRoomLocked(roomID)
			if found && inviteeSession != nil && inviteeSession.ChatID != chatID {
				return fmt.Errorf("participant is busy in another call")
			}
		}
	}
	switch conflict.Kind {
	case runtime.CallConflictChat:
		return fmt.Errorf("call already in progress for this chat")
	case runtime.CallConflictInitiator:
		return errCallUserAlreadyInAnotherCall
	case runtime.CallConflictParticipant:
		return fmt.Errorf("participant is busy in another call")
	default:
		return fmt.Errorf("call conflict")
	}
}

func (s *Server) joinCallSession(chat chatPublic, userID string, callType string) (*callSession, bool, error) {
	return s.joinCallSessionAttempt(chat, userID, callType, true)
}

func (s *Server) joinCallSessionAttempt(chat chatPublic, userID string, callType string, mayRecoverPrevious bool) (*callSession, bool, error) {
	callType = normalizeCallType(callType)
	members := chatMemberSet(chat)
	if !members[userID] {
		return nil, false, fmt.Errorf("you are not a member of this chat")
	}

	s.calls.Lock()
	session, exists := s.calls.ByChatLocked(chat.ID)
	if exists && session != nil {
		if p, ok := session.Participants[userID]; ok && p != nil && (p.State == participantConnected || p.State == participantConnecting) {
			s.calls.Unlock()
			return session, false, nil
		}

		if roomID, busy := s.calls.ActiveRoomLocked(userID); busy && roomID != session.ID {
			previous, found := s.calls.ByRoomLocked(roomID)
			if !found || previous == nil || !previous.IsParticipant(userID) {
				// Recovered call state can leave an active-room key behind after its
				// session or participant was removed. Revalidate before rejecting a
				// legitimate join.
				s.calls.ClearActiveLocked(userID)
			} else {
				s.calls.Unlock()
				if mayRecoverPrevious {
					if _, released, _ := s.releasePreviousCallForRetry(userID); released {
						return s.joinCallSessionAttempt(chat, userID, callType, false)
					}
				}
				return nil, false, errCallUserAlreadyInAnotherCall
			}
		}

		now := time.Now().UTC()
		if p, ok := session.Participants[userID]; ok && p != nil {
			p.State = participantConnected
			if p.JoinedAt.IsZero() {
				p.JoinedAt = now
			}
		} else {
			session.Participants[userID] = &callParticipant{
				UserID:   userID,
				Role:     "member",
				State:    participantConnected,
				JoinedAt: now,
			}
		}
		s.calls.SetActiveLocked(userID, session.ID)
		if chat.Type == "voice" || (session.ConnectedOrConnectingCount() > maxMeshParticipants && s.isSFUConfigured()) {
			session.Topology = callTopologySFU
		}
		s.calls.Unlock()

		go func(sess *callSession) {
			ctx := context.Background()
			s.persistCallParticipants(ctx, sess)
			s.persistCallSession(ctx, sess, 3600*time.Second)
		}(session)

		return session, false, nil
	}
	s.calls.Unlock()

	sess, err := s.startCallSession(chat, userID, callType, nil)
	if err != nil {
		return nil, false, err
	}
	return sess, true, nil
}

func (s *Server) finishEndedCall(session *callSession) {
	s.stopActiveTranscriptionForEndedCall(session)
	go func(sess *callSession) {
		ctx := context.Background()
		dur := int(time.Since(sess.CreatedAt).Seconds())
		_ = s.callPersistence.End(ctx, sess.ID, dur, time.Now().UTC())
		s.deleteCallSession(ctx, sess.ID)
		s.deleteCallSession(ctx, sess.ChatID)
	}(session)
}

// releasePreviousCallForRetry removes this user's previous call membership
// before one explicit retry of a newly requested call. It applies the same
// caller/one-to-one end rules as call:end and leaves only the user when they
// are a non-caller in a larger group call.
func (s *Server) releasePreviousCallForRetry(userID string) (*callSession, bool, bool) {
	s.calls.Lock()
	roomID, active := s.calls.ActiveRoomLocked(userID)
	if !active {
		s.calls.Unlock()
		return nil, false, false
	}
	previous, found := s.calls.ByRoomLocked(roomID)
	if !found || previous == nil || !previous.IsParticipant(userID) {
		if currentRoomID, stillActive := s.calls.ActiveRoomLocked(userID); stillActive && currentRoomID == roomID {
			s.calls.ClearActiveLocked(userID)
		}
		s.calls.Unlock()
		return nil, true, false
	}
	chatID := previous.ChatID
	s.calls.Unlock()

	var released bool
	updated, found, ended := s.calls.UpdateByChat(chatID, func(session *callSession) bool {
		if session.ID != roomID || !session.IsParticipant(userID) {
			return false
		}
		released = true
		if session.CallerUserID == userID || len(session.ActiveParticipantIDs()) <= 2 {
			return true
		}
		s.setParticipantState(session, userID, participantLeft)
		return !session.HasLiveParticipants()
	})
	if !found || !released {
		return nil, false, false
	}
	if ended {
		s.finishEndedCall(updated)
	} else {
		go func(sess *callSession) {
			ctx := context.Background()
			s.persistCallParticipants(ctx, sess)
			s.persistCallSession(ctx, sess, 3600*time.Second)
		}(updated)
	}

	extra := map[string]any{"reason": "replaced", "userId": userID, "endedAt": nowString()}
	payload := updated.ActionPayload(extra)
	if ended {
		if s.callPersistence != nil {
			s.recordCallHistory(updated, "ended")
		}
		s.emitCallToParticipants(updated, "call:ended", payload)
	} else {
		s.emitCallToUser(userID, "call:ended", payload)
		s.emitCallToActiveParticipants(updated, "call:participant-updated", payload)
	}
	return updated, true, ended
}
