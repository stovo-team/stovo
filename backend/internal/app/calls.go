package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

const maxMeshParticipants = 4

type callState string

const (
	callStateRinging    callState = "ringing"
	callStateConnecting callState = "connecting"
	callStateConnected  callState = "connected"
)

type callTopology string

const (
	callTopologyMesh callTopology = "mesh"
	callTopologySFU  callTopology = "sfu"
)

type callParticipantState string

const (
	participantInvited    callParticipantState = "invited"
	participantRinging    callParticipantState = "ringing"
	participantConnecting callParticipantState = "connecting"
	participantConnected  callParticipantState = "connected"
	participantLeft       callParticipantState = "left"
	participantDeclined   callParticipantState = "declined"
)

type callParticipant struct {
	UserID   string               `json:"userId"`
	Role     string               `json:"role"` // "host" | "member"
	State    callParticipantState `json:"state"`
	JoinedAt time.Time            `json:"joinedAt,omitempty"`
}

type callSession struct {
	ID           string                      `json:"id"`
	ChatID       string                      `json:"chatId"`
	CallerUserID string                      `json:"callerId"` // host / createdBy
	CalleeUserID string                      `json:"calleeId"` // primary invitee (1:1 compat)
	CallType     string                      `json:"callType"` // "audio" | "video"
	Topology     callTopology                `json:"topology"`
	State        callState                   `json:"state"`
	Participants map[string]*callParticipant `json:"participants"`
	CreatedAt    time.Time                   `json:"createdAt"`
	ConnectedAt  time.Time                   `json:"connectedAt"`
	ExpiresAt    time.Time                   `json:"expiresAt"`
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
	case "canceled":
		return "canceled", false
	default:
		return "failed", false
	}
}

func normalizeCallType(callType string) string {
	if callType != "audio" && callType != "video" {
		return "audio"
	}
	return callType
}

func (session *callSession) participantIDs() []string {
	ids := make([]string, 0, len(session.Participants))
	for id := range session.Participants {
		ids = append(ids, id)
	}
	return ids
}

func (session *callSession) activeParticipantIDs() []string {
	ids := make([]string, 0, len(session.Participants))
	for id, p := range session.Participants {
		if p == nil {
			continue
		}
		switch p.State {
		case participantLeft, participantDeclined:
			continue
		default:
			ids = append(ids, id)
		}
	}
	return ids
}

func (session *callSession) connectedOrConnectingCount() int {
	n := 0
	for _, p := range session.Participants {
		if p == nil {
			continue
		}
		if p.State == participantConnected || p.State == participantConnecting {
			n++
		}
	}
	return n
}

func (session *callSession) ringingInviteeIDs() []string {
	ids := make([]string, 0)
	for id, p := range session.Participants {
		if p != nil && (p.State == participantRinging || p.State == participantInvited) && p.Role != "host" {
			ids = append(ids, id)
		}
	}
	return ids
}

func (session *callSession) hasLiveParticipants() bool {
	for _, p := range session.Participants {
		if p == nil {
			continue
		}
		switch p.State {
		case participantRinging, participantInvited, participantConnecting, participantConnected:
			return true
		}
	}
	return false
}

func isCallParticipant(session *callSession, userID string) bool {
	if session == nil {
		return false
	}
	p, ok := session.Participants[userID]
	return ok && p != nil && p.State != participantLeft && p.State != participantDeclined
}

func isCallParticipantAny(session *callSession, userID string) bool {
	if session == nil {
		return false
	}
	_, ok := session.Participants[userID]
	return ok
}

func (session *callSession) publicParticipants() []map[string]any {
	out := make([]map[string]any, 0, len(session.Participants))
	for _, p := range session.Participants {
		if p == nil {
			continue
		}
		item := map[string]any{
			"userId": p.UserID,
			"role":   p.Role,
			"state":  string(p.State),
		}
		if !p.JoinedAt.IsZero() {
			item["joinedAt"] = p.JoinedAt.Format(time.RFC3339Nano)
		}
		out = append(out, item)
	}
	return out
}

func (session *callSession) publicPayload() map[string]any {
	return map[string]any{
		"roomId":       session.ID,
		"chatId":       session.ChatID,
		"callerId":     session.CallerUserID,
		"calleeId":     session.CalleeUserID,
		"callType":     session.CallType,
		"topology":     string(session.Topology),
		"state":        string(session.State),
		"createdAt":    session.CreatedAt.Format(time.RFC3339Nano),
		"expiresAt":    session.ExpiresAt.Format(time.RFC3339Nano),
		"participants": session.publicParticipants(),
	}
}

func (session *callSession) actionPayload(extra map[string]any) map[string]any {
	payload := session.publicPayload()
	payload["sessionStartedAt"] = session.CreatedAt.Format(time.RFC3339Nano)
	for k, v := range extra {
		payload[k] = v
	}
	return payload
}

func (s *Server) emitCallToParticipants(session *callSession, event string, payload any) {
	for _, userID := range session.participantIDs() {
		s.emitCallToUser(userID, event, payload)
	}
}

func (s *Server) emitCallToActiveParticipants(session *callSession, event string, payload any) {
	for _, userID := range session.activeParticipantIDs() {
		s.emitCallToUser(userID, event, payload)
	}
}

func memberIDs(chat chatPublic) []string {
	ids := make([]string, 0, len(chat.Members))
	for _, m := range chat.Members {
		ids = append(ids, m.ID)
	}
	return ids
}

func chatMemberSet(chat chatPublic) map[string]bool {
	set := make(map[string]bool, len(chat.Members))
	for _, m := range chat.Members {
		set[m.ID] = true
	}
	return set
}

func (s *Server) startCallSession(chat chatPublic, callerUserID string, callType string, inviteUserIDs []string) (*callSession, error) {
	callType = normalizeCallType(callType)
	if chat.Type == "channel" {
		return nil, fmt.Errorf("calls are not available in channels")
	}
	if chat.Type != "direct" && chat.Type != "group" && chat.Type != "family" {
		return nil, fmt.Errorf("calls are only available in direct and group chats")
	}

	members := chatMemberSet(chat)
	if !members[callerUserID] {
		return nil, fmt.Errorf("you are not a member of this chat")
	}

	invitees := make([]string, 0)
	seen := map[string]bool{callerUserID: true}
	if len(inviteUserIDs) > 0 {
		for _, id := range inviteUserIDs {
			id = strings.TrimSpace(id)
			if id == "" || seen[id] {
				continue
			}
			if !members[id] {
				return nil, fmt.Errorf("invitee is not a member of this chat")
			}
			seen[id] = true
			invitees = append(invitees, id)
		}
	} else if chat.Type == "direct" {
		for _, id := range memberIDs(chat) {
			if id != callerUserID {
				invitees = append(invitees, id)
				break
			}
		}
	} else {
		for _, id := range memberIDs(chat) {
			if id != callerUserID {
				invitees = append(invitees, id)
			}
		}
	}
	if len(invitees) == 0 {
		return nil, fmt.Errorf("could not determine call participants")
	}

	for _, invitee := range invitees {
		if chat.Type == "direct" {
			if blocked, err := s.directContactBlocked(callerUserID, invitee); err != nil {
				return nil, fmt.Errorf("could not check privacy settings")
			} else if blocked {
				return nil, fmt.Errorf("calls are unavailable for this member")
			}
		}
	}

	s.callMu.Lock()
	defer s.callMu.Unlock()

	if _, exists := s.callByChat[chat.ID]; exists {
		return nil, fmt.Errorf("call already in progress for this chat")
	}
	if roomID, busy := s.userActiveCall[callerUserID]; busy {
		if existing := s.callByRoom[roomID]; existing != nil && existing.ChatID != chat.ID {
			return nil, fmt.Errorf("you are already in another call")
		}
	}
	for _, invitee := range invitees {
		if roomID, busy := s.userActiveCall[invitee]; busy {
			if existing := s.callByRoom[roomID]; existing != nil && existing.ChatID != chat.ID {
				return nil, fmt.Errorf("participant is busy in another call")
			}
		}
	}

	now := time.Now().UTC()
	roomID := uuid.NewString()
	participants := map[string]*callParticipant{
		callerUserID: {
			UserID: callerUserID,
			Role:   "host",
			State:  participantRinging,
		},
	}
	for _, invitee := range invitees {
		participants[invitee] = &callParticipant{
			UserID: invitee,
			Role:   "member",
			State:  participantRinging,
		}
	}

	topology := callTopologyMesh
	if len(participants) > maxMeshParticipants {
		topology = callTopologySFU
	}

	session := &callSession{
		ID:           roomID,
		ChatID:       chat.ID,
		CallerUserID: callerUserID,
		CalleeUserID: invitees[0],
		CallType:     callType,
		Topology:     topology,
		State:        callStateRinging,
		Participants: participants,
		CreatedAt:    now,
		ExpiresAt:    now.Add(s.callTimeout),
	}
	s.indexCallSession(session)
	if s.db != nil {
		go func(sess *callSession) {
			ctx := context.Background()
			s.exec(`INSERT INTO call_sessions (id, chat_id, caller_id, callee_id, call_type, topology, state, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
				ON CONFLICT (id) DO NOTHING`,
				sess.ID, sess.ChatID, sess.CallerUserID, sess.CalleeUserID, sess.CallType, string(sess.Topology), string(sess.State))
			s.persistCallParticipants(ctx, sess)
			s.persistCallSession(ctx, sess, 60*time.Second)
		}(session)
	}
	return session, nil
}

func (s *Server) indexCallSession(session *callSession) {
	s.callByRoom[session.ID] = session
	s.callByChat[session.ChatID] = session
	for userID, p := range session.Participants {
		if p == nil {
			continue
		}
		if p.State == participantLeft || p.State == participantDeclined {
			continue
		}
		s.userActiveCall[userID] = session.ID
	}
}

func (s *Server) unindexCallSession(session *callSession) {
	delete(s.callByRoom, session.ID)
	delete(s.callByChat, session.ChatID)
	for userID := range session.Participants {
		if s.userActiveCall[userID] == session.ID {
			delete(s.userActiveCall, userID)
		}
	}
}

func (s *Server) getCallSession(chatID string) (*callSession, bool) {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	session, ok := s.callByChat[chatID]
	return session, ok
}

func (s *Server) getCallSessionByRoom(roomID string) (*callSession, bool) {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	session, ok := s.callByRoom[roomID]
	return session, ok
}

func (s *Server) resolveCallSession(chatID, roomID string) (*callSession, bool) {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	if roomID != "" {
		if session, ok := s.callByRoom[roomID]; ok {
			return session, true
		}
	}
	if chatID != "" {
		if session, ok := s.callByChat[chatID]; ok {
			return session, true
		}
	}
	return nil, false
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
		s.exec(`UPDATE call_sessions SET state = ? WHERE id = ?`, string(st), sess.ID)
		ttl := 60 * time.Second
		if st == callStateConnecting || st == callStateConnected {
			ttl = 3600 * time.Second
		}
		s.persistCallSession(ctx, sess, ttl)
	}(session, state)
	return session, true
}

func (s *Server) setParticipantState(session *callSession, userID string, state callParticipantState) {
	if session == nil {
		return
	}
	p := session.Participants[userID]
	if p == nil {
		return
	}
	p.State = state
	if state == participantConnected || state == participantConnecting {
		if p.JoinedAt.IsZero() {
			p.JoinedAt = time.Now().UTC()
		}
	}
	if state == participantLeft || state == participantDeclined {
		if s.userActiveCall[userID] == session.ID {
			delete(s.userActiveCall, userID)
		}
	} else {
		s.userActiveCall[userID] = session.ID
	}
}

func (s *Server) inviteUsersToCall(session *callSession, inviterUserID string, inviteUserIDs []string, chat chatPublic) ([]string, error) {
	if session == nil {
		return nil, fmt.Errorf("call not available")
	}
	if !isCallParticipant(session, inviterUserID) {
		return nil, fmt.Errorf("only call participants can invite")
	}
	members := chatMemberSet(chat)
	inviter, err := s.getUserByID(inviterUserID)
	if err != nil {
		return nil, fmt.Errorf("could not verify inviter")
	}
	added := make([]string, 0)
	s.callMu.Lock()
	defer s.callMu.Unlock()

	for _, raw := range inviteUserIDs {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if !members[id] {
			// Ad-hoc: allow inviting other family members even if they are not in the origin chat.
			invitee, lookupErr := s.getUserByID(id)
			if lookupErr != nil || invitee.FamilyID == "" || invitee.FamilyID != inviter.FamilyID {
				return nil, fmt.Errorf("invitee is not in your family")
			}
		}
		if existing := session.Participants[id]; existing != nil && existing.State != participantLeft && existing.State != participantDeclined {
			continue
		}
		if roomID, busy := s.userActiveCall[id]; busy && roomID != session.ID {
			return nil, fmt.Errorf("participant is busy in another call")
		}
		if blocked, blockErr := s.directContactBlocked(inviterUserID, id); blockErr != nil {
			return nil, fmt.Errorf("could not check privacy settings")
		} else if blocked {
			return nil, fmt.Errorf("calls are unavailable for this member")
		}
		session.Participants[id] = &callParticipant{
			UserID: id,
			Role:   "member",
			State:  participantRinging,
		}
		s.userActiveCall[id] = session.ID
		added = append(added, id)
		if session.CalleeUserID == "" {
			session.CalleeUserID = id
		}
	}
	if len(added) == 0 {
		return nil, fmt.Errorf("no new participants to invite")
	}

	session.ExpiresAt = time.Now().UTC().Add(s.callTimeout)
	go func(sess *callSession) {
		ctx := context.Background()
		s.persistCallParticipants(ctx, sess)
		s.persistCallSession(ctx, sess, 60*time.Second)
	}(session)
	return added, nil
}

func (s *Server) maybePromoteToSFULocked(session *callSession) (bool, error) {
	if session.Topology == callTopologySFU {
		return false, nil
	}
	if session.connectedOrConnectingCount() <= maxMeshParticipants {
		return false, nil
	}
	if strings.TrimSpace(s.cfg.LiveKitURL) == "" || strings.TrimSpace(s.cfg.LiveKitAPIKey) == "" || strings.TrimSpace(s.cfg.LiveKitAPISecret) == "" {
		return false, fmt.Errorf("group call limit reached; SFU is not configured")
	}
	session.Topology = callTopologySFU
	go func(sess *callSession) {
		if s.db == nil {
			return
		}
		ctx := context.Background()
		s.exec(`UPDATE call_sessions SET topology = ? WHERE id = ?`, string(callTopologySFU), sess.ID)
		s.persistCallSession(ctx, sess, 3600*time.Second)
	}(session)
	return true, nil
}

func (s *Server) promoteCallToSFU(session *callSession) (bool, error) {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	return s.maybePromoteToSFULocked(session)
}

func (s *Server) recordCallHistory(session *callSession, reason string) {
	status, completed := callHistoryStatus(session.State, reason)
	participantIDs := session.participantIDs()
	record := callHistoryPublic{
		Status:         status,
		CallType:       session.CallType,
		CallerID:       session.CallerUserID,
		CalleeID:       session.CalleeUserID,
		ParticipantIDs: participantIDs,
		Topology:       string(session.Topology),
		RoomID:         session.ID,
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
	s.bumpChatHistoryRevision(context.Background(), session.ChatID)
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
	s.unindexCallSession(session)
	if s.db != nil {
		go func(sess *callSession) {
			ctx := context.Background()
			dur := int(time.Since(sess.CreatedAt).Seconds())
			s.exec(`UPDATE call_sessions SET state = 'ended', ended_at = NOW(), duration_s = ? WHERE id = ?`, dur, sess.ID)
			s.deleteCallSession(ctx, sess.ID)
			s.deleteCallSession(ctx, sess.ChatID)
		}(session)
	}
	return session, true
}

func (s *Server) leaveCallSession(chatID, userID string) (*callSession, bool, bool) {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	session, ok := s.callByChat[chatID]
	if !ok || !isCallParticipantAny(session, userID) {
		return nil, false, false
	}
	s.setParticipantState(session, userID, participantLeft)
	ended := !session.hasLiveParticipants()
	if ended {
		s.unindexCallSession(session)
		if s.db != nil {
			go func(sess *callSession) {
				ctx := context.Background()
				dur := int(time.Since(sess.CreatedAt).Seconds())
				s.exec(`UPDATE call_sessions SET state = 'ended', ended_at = NOW(), duration_s = ? WHERE id = ?`, dur, sess.ID)
				s.deleteCallSession(ctx, sess.ID)
				s.deleteCallSession(ctx, sess.ChatID)
			}(session)
		}
	} else if s.db != nil {
		go func(sess *callSession) {
			ctx := context.Background()
			s.persistCallParticipants(ctx, sess)
			s.persistCallSession(ctx, sess, 3600*time.Second)
		}(session)
	}
	return session, true, ended
}

func (s *Server) endCallForUser(userID string) (*callSession, bool) {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	roomID, ok := s.userActiveCall[userID]
	if !ok {
		return nil, false
	}
	_, exists := s.callByRoom[roomID]
	if !exists {
		delete(s.userActiveCall, userID)
		return nil, false
	}
	// A socket disconnect is not a hang-up: backgrounding and tab changes
	// temporarily remove a participant's socket while the call must remain live.
	return nil, false
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
	roomID, ok := s.userActiveCall[userID]
	if !ok {
		return nil
	}
	session, exists := s.callByRoom[roomID]
	if !exists {
		return nil
	}
	return session
}

// getRingingSessionForUser returns the active ringing call session for a user
// (where the user is an invitee still ringing), or nil if none.
func (s *Server) getRingingSessionForUser(userID string) *callSession {
	s.callMu.Lock()
	defer s.callMu.Unlock()
	roomID, ok := s.userActiveCall[userID]
	if !ok {
		return nil
	}
	session, exists := s.callByRoom[roomID]
	if !exists {
		return nil
	}
	p := session.Participants[userID]
	if p == nil || (p.State != participantRinging && p.State != participantInvited) {
		return nil
	}
	if session.State != callStateRinging && session.State != callStateConnecting && session.State != callStateConnected {
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
		if !session.ExpiresAt.Equal(expiresAt) {
			return
		}
		// Only time out invitees still ringing; connected multi-party calls continue.
		ringing := session.ringingInviteeIDs()
		if len(ringing) == 0 {
			return
		}
		if session.State == callStateConnected || session.connectedOrConnectingCount() > 1 {
			s.callMu.Lock()
			for _, id := range ringing {
				s.setParticipantState(session, id, participantLeft)
			}
			payload := session.actionPayload(map[string]any{"reason": "timeout", "endedAt": nowString()})
			s.callMu.Unlock()
			for _, id := range ringing {
				s.emitCallToUser(id, "call:timeout", payload)
				s.emitCallToUser(id, "call:ended", payload)
				go s.notifyCallMissed(id, callerName, session.ChatID)
			}
			s.emitCallToActiveParticipants(session, "call:participant-updated", payload)
			return
		}
		ended, endedOK := s.endCallSession(chatID)
		if !endedOK {
			return
		}
		s.recordCallHistory(ended, "timeout")
		payload := ended.actionPayload(map[string]any{"reason": "timeout", "endedAt": nowString()})
		s.emitCallToParticipants(ended, "call:timeout", payload)
		s.emitCallToParticipants(ended, "call:ended", payload)
		s.logger.Warnf("realtime.call", "call timed out chat_id=%s room_id=%s caller=%s", ended.ChatID, ended.ID, ended.CallerUserID)
		for _, id := range ended.ringingInviteeIDs() {
			go s.notifyCallMissed(id, callerName, ended.ChatID)
		}
		for _, id := range ringing {
			go s.notifyCallMissed(id, callerName, ended.ChatID)
		}
	}()
}

func (s *Server) persistCallParticipants(ctx context.Context, session *callSession) {
	if s.db == nil || session == nil {
		return
	}
	for _, p := range session.Participants {
		if p == nil {
			continue
		}
		joined := interface{}(nil)
		if !p.JoinedAt.IsZero() {
			joined = p.JoinedAt.UTC()
		}
		s.exec(`INSERT INTO call_participants (room_id, user_id, role, state, joined_at)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT (room_id, user_id) DO UPDATE SET role = EXCLUDED.role, state = EXCLUDED.state, joined_at = COALESCE(EXCLUDED.joined_at, call_participants.joined_at)`,
			session.ID, p.UserID, p.Role, string(p.State), joined)
	}
}
