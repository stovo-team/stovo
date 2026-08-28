package app

import (
	"context"
	"strings"

	"stovo-messenger/backend/internal/cache"

	socketio "github.com/doquangtan/socketio/v4"
)

func (s *Server) registerCallSocketHandlers(socket *socketio.Socket, user userPublic) {
	socket.On("call:start", func(event *socketio.EventPayload) {
		var payload socketCallStartRequest
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || strings.TrimSpace(payload.ChatID) == "" {
			s.logger.Warnf("realtime.call", "call:start invalid payload user_id=%s socket_id=%s", user.ID, socket.Id)
			_ = socket.Emit("call:error", map[string]any{"message": "Invalid call start payload"})
			return
		}
		s.logger.Infof("realtime.call", "call:start requested user_id=%s chat_id=%s socket_id=%s", user.ID, payload.ChatID, socket.Id)
		if _, err := cache.NewRateLimitService(s.cache).CheckFixedWindow(context.Background(), "rate-limit:call-start:"+user.ID, 10, 60); err != nil {
			s.logger.Warnf("realtime.call", "call:start rate-limited user_id=%s chat_id=%s error=%v", user.ID, payload.ChatID, err)
			_ = socket.Emit("call:error", map[string]any{"chatId": payload.ChatID, "message": "Rate limit exceeded"})
			return
		}
		chat, err := s.buildChatPublic(payload.ChatID, user)
		if err != nil {
			s.logger.Warnf("realtime.call", "call:start chat lookup failed user_id=%s chat_id=%s error=%v", user.ID, payload.ChatID, err)
			_ = socket.Emit("call:error", map[string]any{"chatId": payload.ChatID, "message": "Chat not found"})
			return
		}
		callType := strings.TrimSpace(payload.CallType)
		if callType == "" {
			callType = "audio"
		}
		session, err := s.startCallSession(chat, user.ID, callType, payload.InviteUserIDs)
		if err != nil {
			s.logger.Warnf("realtime.call", "call:start session creation failed user_id=%s chat_id=%s error=%v", user.ID, payload.ChatID, err)
			_ = socket.Emit("call:error", map[string]any{"chatId": payload.ChatID, "message": err.Error()})
			return
		}
		payloadMap := session.publicPayload()
		if chat.Type == "voice" {
			_ = socket.Emit("call:accepted", payloadMap)
			s.emitCallToActiveParticipants(session, "call:participant-updated", payloadMap)
			if session.Topology == callTopologySFU {
				_ = socket.Emit("call:topology", map[string]any{
					"roomId":   session.ID,
					"chatId":   session.ChatID,
					"topology": string(callTopologySFU),
					"sfuUrl":   s.cfg.LiveKitURL,
					"roomName": session.ID,
				})
			}
			return
		}
		s.logger.Infof("realtime.call", "call:ringing emitted chat_id=%s room_id=%s caller=%s participants=%d", session.ChatID, session.ID, session.CallerUserID, len(session.Participants))
		s.emitCallToActiveParticipants(session, "call:ringing", payloadMap)
		if session.Topology == callTopologySFU {
			s.emitCallToActiveParticipants(session, "call:topology", map[string]any{
				"roomId":   session.ID,
				"chatId":   session.ChatID,
				"topology": string(callTopologySFU),
				"sfuUrl":   s.cfg.LiveKitURL,
				"roomName": session.ID,
			})
		}
		s.scheduleCallTimeout(session.ChatID, session.ExpiresAt, user.DisplayName)
		for _, inviteeID := range session.ringingInviteeIDs() {
			go s.notifyCallRinging(inviteeID, user.DisplayName, session.ChatID)
		}
	})

	socket.On("call:join", func(event *socketio.EventPayload) {
		var payload socketCallStartRequest
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || strings.TrimSpace(payload.ChatID) == "" {
			_ = socket.Emit("call:error", map[string]any{"message": "Invalid call join payload"})
			return
		}
		chat, err := s.buildChatPublic(payload.ChatID, user)
		if err != nil {
			_ = socket.Emit("call:error", map[string]any{"chatId": payload.ChatID, "message": "Chat not found"})
			return
		}
		callType := strings.TrimSpace(payload.CallType)
		if callType == "" {
			callType = "audio"
		}
		session, isNew, err := s.joinCallSession(chat, user.ID, callType)
		if err != nil {
			_ = socket.Emit("call:error", map[string]any{"chatId": payload.ChatID, "message": err.Error()})
			return
		}
		payloadMap := session.actionPayload(nil)
		_ = socket.Emit("call:accepted", payloadMap)
		s.emitCallToActiveParticipants(session, "call:participant-updated", payloadMap)
		if session.Topology == callTopologySFU {
			topo := map[string]any{
				"roomId":   session.ID,
				"chatId":   session.ChatID,
				"topology": string(callTopologySFU),
				"sfuUrl":   s.cfg.LiveKitURL,
				"roomName": session.ID,
			}
			_ = socket.Emit("call:topology", topo)
			s.emitCallToActiveParticipants(session, "call:topology", topo)
		}
		if isNew && chat.Type != "voice" {
			s.scheduleCallTimeout(session.ChatID, session.ExpiresAt, user.DisplayName)
		}
	})

	socket.On("call:invite", func(event *socketio.EventPayload) {
		var payload socketCallInviteRequest
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || (strings.TrimSpace(payload.ChatID) == "" && strings.TrimSpace(payload.RoomID) == "") {
			_ = socket.Emit("call:error", map[string]any{"message": "Invalid call invite payload"})
			return
		}
		session, ok := s.resolveCallSession(payload.ChatID, payload.RoomID)
		if !ok {
			_ = socket.Emit("call:error", map[string]any{"chatId": payload.ChatID, "message": "Call not available"})
			return
		}
		chat, err := s.buildChatPublic(session.ChatID, user)
		if err != nil {
			_ = socket.Emit("call:error", map[string]any{"chatId": session.ChatID, "message": "Chat not found"})
			return
		}
		added, err := s.inviteUsersToCall(session, user.ID, payload.InviteUserIDs, chat)
		if err != nil {
			_ = socket.Emit("call:error", map[string]any{"chatId": session.ChatID, "message": err.Error()})
			return
		}
		payloadMap := session.actionPayload(map[string]any{"invitedUserIds": added})
		s.emitCallToActiveParticipants(session, "call:participant-updated", payloadMap)
		for _, inviteeID := range added {
			s.emitCallToUser(inviteeID, "call:ringing", session.publicPayload())
			go s.notifyCallRinging(inviteeID, user.DisplayName, session.ChatID)
		}
		s.scheduleCallTimeout(session.ChatID, session.ExpiresAt, user.DisplayName)
	})

	socket.On("call:accept", func(event *socketio.EventPayload) {
		var payload socketCallActionRequest
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || (strings.TrimSpace(payload.ChatID) == "" && strings.TrimSpace(payload.RoomID) == "") {
			_ = socket.Emit("call:error", map[string]any{"message": "Invalid call accept payload"})
			return
		}
		session, ok := s.resolveCallSession(payload.ChatID, payload.RoomID)
		if !ok || !isCallParticipant(session, user.ID) {
			_ = socket.Emit("call:error", map[string]any{"chatId": payload.ChatID, "message": "Call not available"})
			return
		}
		p := session.Participants[user.ID]
		if p == nil || p.Role == "host" || (p.State != participantRinging && p.State != participantInvited) {
			_ = socket.Emit("call:error", map[string]any{"chatId": session.ChatID, "message": "Call not available"})
			return
		}

		s.calls.Lock()
		s.setParticipantState(session, user.ID, participantConnecting)
		if host := session.Participants[session.CallerUserID]; host != nil && host.State == participantRinging {
			s.setParticipantState(session, session.CallerUserID, participantConnecting)
		}
		promoted, promoteErr := s.maybePromoteToSFULocked(session)
		if promoteErr != nil {
			s.setParticipantState(session, user.ID, participantRinging)
			s.calls.Unlock()
			_ = socket.Emit("call:error", map[string]any{"chatId": session.ChatID, "message": promoteErr.Error()})
			return
		}
		s.calls.Unlock()

		session, _ = s.setCallSessionState(session.ChatID, callStateConnecting)
		payloadMap := session.actionPayload(nil)
		s.emitCallToActiveParticipants(session, "call:accepted", payloadMap)
		s.emitCallToActiveParticipants(session, "call:participant-updated", payloadMap)
		if promoted {
			topo := map[string]any{
				"roomId":   session.ID,
				"chatId":   session.ChatID,
				"topology": string(callTopologySFU),
				"sfuUrl":   s.cfg.LiveKitURL,
				"roomName": session.ID,
			}
			s.emitCallToActiveParticipants(session, "call:topology", topo)
		}
	})

	socket.On("call:decline", func(event *socketio.EventPayload) {
		var payload socketCallActionRequest
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || (strings.TrimSpace(payload.ChatID) == "" && strings.TrimSpace(payload.RoomID) == "") {
			_ = socket.Emit("call:error", map[string]any{"message": "Invalid call decline payload"})
			return
		}
		session, ok := s.resolveCallSession(payload.ChatID, payload.RoomID)
		if !ok || !isCallParticipant(session, user.ID) {
			_ = socket.Emit("call:error", map[string]any{"chatId": payload.ChatID, "message": "Call not available"})
			return
		}
		p := session.Participants[user.ID]
		if p == nil || p.Role == "host" {
			_ = socket.Emit("call:error", map[string]any{"chatId": session.ChatID, "message": "Call not available"})
			return
		}

		s.calls.Lock()
		s.setParticipantState(session, user.ID, participantDeclined)
		shouldEnd := !session.hasLiveParticipants() || (session.connectedOrConnectingCount() == 0 && len(session.ringingInviteeIDs()) == 0)
		s.calls.Unlock()
		if shouldEnd {
			ended, endedOK := s.endCallSession(session.ChatID)
			if !endedOK {
				return
			}
			s.recordCallHistory(ended, "declined")
			payloadMap := ended.actionPayload(map[string]any{"reason": "declined", "endedAt": nowString()})
			s.emitCallToParticipants(ended, "call:declined", payloadMap)
			s.emitCallToParticipants(ended, "call:ended", payloadMap)
			return
		}
		payloadMap := session.actionPayload(map[string]any{"reason": "declined", "userId": user.ID, "endedAt": nowString()})
		s.emitCallToUser(user.ID, "call:declined", payloadMap)
		s.emitCallToUser(user.ID, "call:ended", payloadMap)
		s.emitCallToActiveParticipants(session, "call:participant-updated", payloadMap)
	})

	socket.On("call:cancel", func(event *socketio.EventPayload) {
		var payload socketCallActionRequest
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || (strings.TrimSpace(payload.ChatID) == "" && strings.TrimSpace(payload.RoomID) == "") {
			_ = socket.Emit("call:error", map[string]any{"message": "Invalid call cancel payload"})
			return
		}
		session, ok := s.resolveCallSession(payload.ChatID, payload.RoomID)
		if !ok || !isCallParticipant(session, user.ID) || session.CallerUserID != user.ID {
			_ = socket.Emit("call:error", map[string]any{"chatId": payload.ChatID, "message": "Call not available"})
			return
		}
		wasRinging := session.State == callStateRinging
		ringingIDs := session.ringingInviteeIDs()
		ended, endedOK := s.endCallSession(session.ChatID)
		if !endedOK {
			return
		}
		s.recordCallHistory(ended, "canceled")
		payloadMap := ended.actionPayload(map[string]any{"reason": "canceled", "endedAt": nowString()})
		s.emitCallToParticipants(ended, "call:canceled", payloadMap)
		s.emitCallToParticipants(ended, "call:ended", payloadMap)
		if wasRinging {
			for _, id := range ringingIDs {
				go s.notifyCallMissed(id, user.DisplayName, ended.ChatID)
			}
		}
	})

	socket.On("call:leave", func(event *socketio.EventPayload) {
		var payload socketCallActionRequest
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || (strings.TrimSpace(payload.ChatID) == "" && strings.TrimSpace(payload.RoomID) == "") {
			_ = socket.Emit("call:error", map[string]any{"message": "Invalid call leave payload"})
			return
		}
		session, ok := s.resolveCallSession(payload.ChatID, payload.RoomID)
		if !ok || !isCallParticipant(session, user.ID) {
			return
		}
		left, leftOK, ended := s.leaveCallSession(session.ChatID, user.ID)
		if !leftOK {
			return
		}
		payloadMap := left.actionPayload(map[string]any{"reason": "left", "userId": user.ID, "endedAt": nowString()})
		s.emitCallToUser(user.ID, "call:ended", payloadMap)
		if ended {
			s.recordCallHistory(left, "ended")
			s.emitCallToParticipants(left, "call:ended", payloadMap)
		} else {
			s.emitCallToActiveParticipants(left, "call:participant-updated", payloadMap)
		}
	})

	socket.On("call:end", func(event *socketio.EventPayload) {
		var payload socketCallActionRequest
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || (strings.TrimSpace(payload.ChatID) == "" && strings.TrimSpace(payload.RoomID) == "") {
			_ = socket.Emit("call:error", map[string]any{"message": "Invalid call end payload"})
			return
		}
		session, ok := s.resolveCallSession(payload.ChatID, payload.RoomID)
		if !ok || !isCallParticipant(session, user.ID) {
			return
		}
		if session.CallerUserID != user.ID && len(session.activeParticipantIDs()) > 2 {
			left, leftOK, ended := s.leaveCallSession(session.ChatID, user.ID)
			if !leftOK {
				return
			}
			payloadMap := left.actionPayload(map[string]any{"reason": "left", "userId": user.ID, "endedAt": nowString()})
			s.emitCallToUser(user.ID, "call:ended", payloadMap)
			if ended {
				s.recordCallHistory(left, "ended")
				s.emitCallToParticipants(left, "call:ended", payloadMap)
			} else {
				s.emitCallToActiveParticipants(left, "call:participant-updated", payloadMap)
			}
			return
		}
		ended, endedOK := s.endCallSession(session.ChatID)
		if !endedOK {
			return
		}
		s.recordCallHistory(ended, "ended")
		s.logger.Infof("realtime.call", "call:end user_id=%s chat_id=%s room_id=%s", user.ID, ended.ChatID, ended.ID)
		payloadMap := ended.actionPayload(map[string]any{"reason": "ended", "endedAt": nowString()})
		s.emitCallToParticipants(ended, "call:ended", payloadMap)
	})

	socket.On("call:signal", func(event *socketio.EventPayload) {
		var payload socketCallSignalRequest
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || (strings.TrimSpace(payload.ChatID) == "" && strings.TrimSpace(payload.RoomID) == "") || payload.Data == nil {
			_ = socket.Emit("call:error", map[string]any{"message": "Invalid call signal payload"})
			return
		}
		session, ok := s.resolveCallSession(payload.ChatID, payload.RoomID)
		if !ok || !isCallParticipant(session, user.ID) {
			_ = socket.Emit("call:ended", map[string]any{
				"chatId": payload.ChatID,
				"roomId": payload.RoomID,
				"reason": "session_gone",
			})
			return
		}
		if session.Topology == callTopologySFU {
			_ = socket.Emit("call:error", map[string]any{"chatId": session.ChatID, "message": "Mesh signaling disabled in SFU mode"})
			return
		}
		targetUserID := ""
		if payload.TargetUserID != nil && strings.TrimSpace(*payload.TargetUserID) != "" {
			targetUserID = strings.TrimSpace(*payload.TargetUserID)
		} else {
			for _, id := range session.activeParticipantIDs() {
				if id != user.ID {
					targetUserID = id
					break
				}
			}
		}
		if targetUserID == "" || !isCallParticipant(session, targetUserID) {
			_ = socket.Emit("call:error", map[string]any{"chatId": session.ChatID, "message": "Invalid call signal target"})
			return
		}
		if session.State == callStateConnecting {
			_, _ = s.setCallSessionState(session.ChatID, callStateConnected)
		}
		s.calls.Lock()
		if p := session.Participants[user.ID]; p != nil && p.State == participantConnecting {
			s.setParticipantState(session, user.ID, participantConnected)
		}
		if p := session.Participants[targetUserID]; p != nil && p.State == participantConnecting {
			s.setParticipantState(session, targetUserID, participantConnected)
		}
		s.calls.Unlock()
		s.emitCallToUser(targetUserID, "call:signal", map[string]any{
			"chatId":     session.ChatID,
			"roomId":     session.ID,
			"fromUserId": user.ID,
			"data":       payload.Data,
		})
	})
}
