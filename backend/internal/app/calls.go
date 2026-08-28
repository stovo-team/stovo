package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"stovo-messenger/backend/internal/repository"

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
	if chat.Type != "direct" && chat.Type != "group" && chat.Type != "family" && chat.Type != "voice" {
		return nil, fmt.Errorf("calls are only available in direct, group, and voice chats")
	}
	initiation, err := s.prepareCallInitiation(chat, callerUserID, callType, inviteUserIDs)
	if err != nil {
		return nil, err
	}
	invitees := initiation.InviteeIDs()

	s.calls.Lock()
	defer s.calls.Unlock()

	if err := s.checkCallConflicts(callerUserID, chat.ID, invitees); err != nil {
		return nil, err
	}

	isVoiceChannel := chat.Type == "voice"
	now := time.Now().UTC()
	roomID := uuid.NewString()

	callerState := participantRinging
	sessionState := callStateRinging
	var connectedAt time.Time
	var callerJoinedAt time.Time
	if initiation.StartsActive {
		callerState = participantConnected
		callerJoinedAt = now
		sessionState = callStateConnected
		connectedAt = now
	}

	participants := map[string]*callParticipant{
		callerUserID: {UserID: callerUserID, Role: "host", State: callerState, JoinedAt: callerJoinedAt},
	}
	for _, invitee := range invitees {
		participants[invitee] = &callParticipant{UserID: invitee, Role: "member", State: participantRinging}
	}

	topology := callTopologyMesh
	// Voice channels are SFU-only. Unlike ad-hoc calls, they must never
	// silently fall back to a mesh topology as members join and leave.
	if isVoiceChannel {
		topology = callTopologySFU
	}
	calleeUserID := ""
	if len(invitees) > 0 {
		calleeUserID = invitees[0]
	}

	session := &callSession{
		ID:           roomID,
		ChatID:       chat.ID,
		CallerUserID: callerUserID,
		CalleeUserID: calleeUserID,
		CallType:     callType,
		Topology:     topology,
		State:        sessionState,
		Participants: participants,
		CreatedAt:    now,
		ConnectedAt:  connectedAt,
		ExpiresAt:    now.Add(s.callTimeout),
	}
	s.indexCallSession(session)
	go func(sess *callSession) {
		ctx := context.Background()
		if s.store != nil {
			_ = s.store.CreateCallSession(ctx, repository.CreateCallSessionParams{
				ID:        sess.ID,
				ChatID:    sess.ChatID,
				CallerID:  sess.CallerUserID,
				CalleeID:  sess.CalleeUserID,
				CallType:  sess.CallType,
				Topology:  string(sess.Topology),
				State:     string(sess.State),
				CreatedAt: sess.CreatedAt,
			})
			s.persistCallParticipants(ctx, sess)
		}
		s.persistCallSession(ctx, sess, 60*time.Second)
	}(session)
	return session, nil
}

// resolveCallInvitees builds the list of users to invite to a call, handling
// direct, group, voice, and explicit invite-list cases.
func (s *Server) resolveCallInvitees(chat chatPublic, callerUserID string, inviteUserIDs []string, members map[string]bool) ([]string, error) {
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
	} else if chat.Type == "voice" {
		// Voice channels do not dial/ring all members on start by default.
	} else {
		for _, id := range memberIDs(chat) {
			if id != callerUserID {
				invitees = append(invitees, id)
			}
		}
	}
	if len(invitees) == 0 && chat.Type != "voice" {
		return nil, fmt.Errorf("could not determine call participants")
	}
	return invitees, nil
}

// validateCallPrivacy checks whether any direct-chat invitee has blocked the caller.
func (s *Server) validateCallPrivacy(callerUserID string, invitees []string, chatType string) error {
	if chatType != "direct" {
		return nil
	}
	for _, invitee := range invitees {
		blocked, err := s.directContactBlocked(callerUserID, invitee)
		if err != nil {
			return fmt.Errorf("could not check privacy settings")
		}
		if blocked {
			return fmt.Errorf("calls are unavailable for this member")
		}
	}
	return nil
}

// checkCallConflicts ensures no concurrent calls exist for the chat, caller, or invitees.
// Must be called with s.calls held.
func (s *Server) checkCallConflicts(callerUserID, chatID string, invitees []string) error {
	if _, exists := s.calls.ByChatLocked(chatID); exists {
		return fmt.Errorf("call already in progress for this chat")
	}
	if roomID, busy := s.calls.ActiveRoomLocked(callerUserID); busy {
		if existing, found := s.calls.ByRoomLocked(roomID); found && existing != nil && existing.ChatID != chatID {
			return fmt.Errorf("you are already in another call")
		}
	}
	for _, invitee := range invitees {
		if roomID, busy := s.calls.ActiveRoomLocked(invitee); busy {
			if existing, found := s.calls.ByRoomLocked(roomID); found && existing != nil && existing.ChatID != chatID {
				return fmt.Errorf("participant is busy in another call")
			}
		}
	}
	return nil
}

func (s *Server) joinCallSession(chat chatPublic, userID string, callType string) (*callSession, bool, error) {
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
			s.calls.Unlock()
			return nil, false, fmt.Errorf("you are already in another call")
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
		if chat.Type == "voice" || (session.connectedOrConnectingCount() > maxMeshParticipants && s.isSFUConfigured()) {
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

func (s *Server) indexCallSession(session *callSession) { s.calls.IndexLocked(session) }

func (s *Server) unindexCallSession(session *callSession) { s.calls.UnindexLocked(session) }

func (s *Server) getCallSession(chatID string) (*callSession, bool) {
	s.calls.Lock()
	defer s.calls.Unlock()
	session, ok := s.calls.ByChatLocked(chatID)
	return session, ok
}

func (s *Server) getCallSessionByRoom(roomID string) (*callSession, bool) {
	s.calls.Lock()
	defer s.calls.Unlock()
	session, ok := s.calls.ByRoomLocked(roomID)
	return session, ok
}

func (s *Server) resolveCallSession(chatID, roomID string) (*callSession, bool) {
	s.calls.Lock()
	if roomID != "" {
		if session, ok := s.calls.ByRoomLocked(roomID); ok {
			s.calls.Unlock()
			return session, true
		}
	}
	if chatID != "" {
		if session, ok := s.calls.ByChatLocked(chatID); ok {
			s.calls.Unlock()
			return session, true
		}
	}
	s.calls.Unlock()

	// Memory miss: Redis is live call-state authority across instances.
	lookupIDs := make([]string, 0, 2)
	if roomID != "" {
		lookupIDs = append(lookupIDs, roomID)
	}
	if chatID != "" && chatID != roomID {
		lookupIDs = append(lookupIDs, chatID)
	}
	ctx := context.Background()
	for _, id := range lookupIDs {
		loaded := s.loadCallSessionFromRedis(ctx, id)
		if loaded == nil {
			continue
		}
		s.calls.Lock()
		if roomID != "" {
			if existing, ok := s.calls.ByRoomLocked(roomID); ok {
				s.calls.Unlock()
				return existing, true
			}
		}
		if chatID != "" {
			if existing, ok := s.calls.ByChatLocked(chatID); ok {
				s.calls.Unlock()
				return existing, true
			}
		}
		if existing, ok := s.calls.ByRoomLocked(loaded.ID); ok {
			s.calls.Unlock()
			return existing, true
		}
		s.indexCallSession(loaded)
		s.calls.Unlock()
		return loaded, true
	}
	return nil, false
}

func (s *Server) setCallSessionState(chatID string, state callState) (*callSession, bool) {
	s.calls.Lock()
	defer s.calls.Unlock()
	session, ok := s.calls.ByChatLocked(chatID)
	if !ok {
		return nil, false
	}
	session.State = state
	if state == callStateConnected && session.ConnectedAt.IsZero() {
		session.ConnectedAt = time.Now().UTC()
	}
	go func(sess *callSession, st callState) {
		ctx := context.Background()
		if s.store != nil {
			_ = s.store.UpdateCallSessionState(ctx, sess.ID, string(st))
		}
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
		if roomID, active := s.calls.ActiveRoomLocked(userID); active && roomID == session.ID {
			s.calls.ClearActiveLocked(userID)
		}
	} else {
		s.calls.SetActiveLocked(userID, session.ID)
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
	s.calls.Lock()
	defer s.calls.Unlock()

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
		if roomID, busy := s.calls.ActiveRoomLocked(id); busy && roomID != session.ID {
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
		s.calls.SetActiveLocked(id, session.ID)
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

func (s *Server) isSFUConfigured() bool {
	return strings.TrimSpace(s.cfg.LiveKitURL) != "" &&
		strings.TrimSpace(s.cfg.LiveKitAPIKey) != "" &&
		strings.TrimSpace(s.cfg.LiveKitAPISecret) != ""
}

func (s *Server) maybePromoteToSFULocked(session *callSession) (bool, error) {
	if session.Topology == callTopologySFU {
		return false, nil
	}
	if session.connectedOrConnectingCount() <= maxMeshParticipants {
		return false, nil
	}
	if !s.isSFUConfigured() {
		return false, fmt.Errorf("group call limit reached; SFU is not configured")
	}
	session.Topology = callTopologySFU
	go func(sess *callSession) {
		ctx := context.Background()
		if s.store != nil {
			_ = s.store.UpdateCallSessionTopology(ctx, sess.ID, string(callTopologySFU))
		}
		s.persistCallSession(ctx, sess, 3600*time.Second)
	}(session)
	return true, nil
}

func (s *Server) promoteCallToSFU(session *callSession) (bool, error) {
	s.calls.Lock()
	defer s.calls.Unlock()
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
	if s.store != nil {
		if err := s.store.RecordCallHistory(context.Background(), repository.RecordCallHistoryParams{
			MessageID:          messageID,
			ChatID:             session.ChatID,
			SenderID:           session.CallerUserID,
			EncryptionMetadata: string(metadata),
			CreatedAt:          now,
			UpdatedAt:          now,
		}); err != nil {
			s.logger.Warnf("realtime.call", "call history insert failed chat_id=%s error=%v", session.ChatID, err)
			return
		}
	}
	// The AI notes message will reply to this call-history record, so it stays
	// visibly attached to the call in the same chat.
	s.linkTranscriptionToCallHistory(session.ID, messageID)
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
	s.calls.Lock()
	session, ok := s.calls.ByChatLocked(chatID)
	if !ok {
		s.calls.Unlock()
		return nil, false
	}
	s.unindexCallSession(session)
	s.calls.Unlock()
	// Stop the recorder while participants are still addressable from this
	// session. This is deliberately before the call:ended event is emitted.
	s.stopActiveTranscriptionForEndedCall(session)
	go func(sess *callSession) {
		ctx := context.Background()
		if s.store != nil {
			dur := int(time.Since(sess.CreatedAt).Seconds())
			_ = s.store.EndCallSession(ctx, sess.ID, dur, time.Now().UTC())
		}
		s.deleteCallSession(ctx, sess.ID)
		s.deleteCallSession(ctx, sess.ChatID)
	}(session)
	return session, true
}

func (s *Server) leaveCallSession(chatID, userID string) (*callSession, bool, bool) {
	s.calls.Lock()
	session, ok := s.calls.ByChatLocked(chatID)
	if !ok || !isCallParticipantAny(session, userID) {
		s.calls.Unlock()
		return nil, false, false
	}
	s.setParticipantState(session, userID, participantLeft)
	ended := !session.hasLiveParticipants()
	if ended {
		s.unindexCallSession(session)
	}
	s.calls.Unlock()
	if ended {
		s.stopActiveTranscriptionForEndedCall(session)
		go func(sess *callSession) {
			ctx := context.Background()
			if s.store != nil {
				dur := int(time.Since(sess.CreatedAt).Seconds())
				_ = s.store.EndCallSession(ctx, sess.ID, dur, time.Now().UTC())
			}
			s.deleteCallSession(ctx, sess.ID)
			s.deleteCallSession(ctx, sess.ChatID)
		}(session)
	} else {
		go func(sess *callSession) {
			ctx := context.Background()
			if s.store != nil {
				s.persistCallParticipants(ctx, sess)
			}
			s.persistCallSession(ctx, sess, 3600*time.Second)
		}(session)
	}
	return session, true, ended
}

func (s *Server) endCallForUser(userID string) (*callSession, bool) {
	s.calls.Lock()
	defer s.calls.Unlock()
	roomID, ok := s.calls.ActiveRoomLocked(userID)
	if !ok {
		return nil, false
	}
	_, exists := s.calls.ByRoomLocked(roomID)
	if !exists {
		s.calls.ClearActiveLocked(userID)
		return nil, false
	}
	// A socket disconnect is not a hang-up: backgrounding and tab changes
	// temporarily remove a participant's socket while the call must remain live.
	return nil, false
}

func (s *Server) userHasActiveCall(userID string) bool {
	s.calls.Lock()
	defer s.calls.Unlock()
	_, ok := s.calls.ActiveRoomLocked(userID)
	return ok
}

// getActiveCallSessionForUser returns any in-memory call session for userID.
func (s *Server) getActiveCallSessionForUser(userID string) *callSession {
	s.calls.Lock()
	defer s.calls.Unlock()
	roomID, ok := s.calls.ActiveRoomLocked(userID)
	if !ok {
		return nil
	}
	session, exists := s.calls.ByRoomLocked(roomID)
	if !exists {
		return nil
	}
	return session
}

// getRingingSessionForUser returns the active ringing call session for a user
// (where the user is an invitee still ringing), or nil if none.
func (s *Server) getRingingSessionForUser(userID string) *callSession {
	s.calls.Lock()
	defer s.calls.Unlock()
	roomID, ok := s.calls.ActiveRoomLocked(userID)
	if !ok {
		return nil
	}
	session, exists := s.calls.ByRoomLocked(roomID)
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
			s.calls.Lock()
			for _, id := range ringing {
				s.setParticipantState(session, id, participantLeft)
			}
			payload := session.actionPayload(map[string]any{"reason": "timeout", "endedAt": nowString()})
			s.calls.Unlock()
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
	if s.store == nil || session == nil {
		return
	}
	for _, p := range session.Participants {
		if p == nil {
			continue
		}
		var joinedAt *time.Time
		if !p.JoinedAt.IsZero() {
			t := p.JoinedAt.UTC()
			joinedAt = &t
		}
		_ = s.store.UpsertCallParticipant(ctx, repository.UpsertCallParticipantParams{
			RoomID:   session.ID,
			UserID:   p.UserID,
			Role:     p.Role,
			State:    string(p.State),
			JoinedAt: joinedAt,
		})
	}
}
