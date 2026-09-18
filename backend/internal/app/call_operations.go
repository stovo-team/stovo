package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"stovo-messenger/backend/internal/adapters/livekit"
	"stovo-messenger/backend/internal/cache"
	"stovo-messenger/backend/internal/domain"
	featurecalls "stovo-messenger/backend/internal/features/calls"
	"stovo-messenger/backend/internal/runtime"
	workruntime "stovo-messenger/backend/internal/runtime"
	"stovo-messenger/backend/internal/ports"
	httptransport "stovo-messenger/backend/internal/transport/http"
	realtimetransport "stovo-messenger/backend/internal/transport/realtime"

	socketio "github.com/doquangtan/socketio/v4"
	"github.com/google/uuid"
)

const maxMeshParticipants = 4
const brokerChannelMessages = "events:messages"

type callState = runtime.CallState

const (
	callStateRinging    = runtime.CallStateRinging
	callStateConnecting = runtime.CallStateConnecting
	callStateConnected  = runtime.CallStateConnected
)

type callTopology = runtime.CallTopology

const (
	callTopologyMesh = runtime.CallTopologyMesh
	callTopologySFU  = runtime.CallTopologySFU
)

type callParticipantState = runtime.CallParticipantState

const (
	participantInvited    = runtime.ParticipantInvited
	participantRinging    = runtime.ParticipantRinging
	participantConnecting = runtime.ParticipantConnecting
	participantConnected  = runtime.ParticipantConnected
	participantLeft       = runtime.ParticipantLeft
	participantDeclined   = runtime.ParticipantDeclined
)

type callParticipant = runtime.CallParticipant
type callSession = runtime.CallSession

// NewCallManager supplies the runtime coordinator with app-owned session
// readers. Runtime owns locking and index transitions; app owns its session
// representation and protocol/persistence callbacks.
func NewCallManager() *workruntime.CallCoordinator[*callSession] {
	return workruntime.NewCallCoordinator(
		func(session *callSession) (string, string) { return session.ID, session.ChatID },
		func(session *callSession) []string { return session.ActiveParticipantIDs() },
	)
}

// prepareCallInitiation adapts the existing app data to the pure call use case.
func (s *Server) prepareCallInitiation(chat chatPublic, callerUserID, callType string, inviteUserIDs []string) (domain.CallInitiation, error) {
	service := featurecalls.NewService(callChatReader{chat: callChatFromPublic(chat)}, directCallPrivacyCheck(s.directContactBlocked), nil)
	initiation, err := service.PrepareStart(context.Background(), featurecalls.StartInput{
		ChatID: chat.ID, CallerUserID: callerUserID, CallType: callType, InviteUserIDs: inviteUserIDs,
	})
	if errors.Is(err, featurecalls.ErrNotChatMember) {
		return domain.CallInitiation{}, fmt.Errorf("you are not a member of this chat")
	}
	return initiation, err
}

type callChatReader struct{ chat domain.CallChat }

func (r callChatReader) CallChat(context.Context, string) (domain.CallChat, error) {
	return r.chat, nil
}

type directCallPrivacyCheck func(callerUserID, inviteeUserID string) (bool, error)

func (check directCallPrivacyCheck) DirectCallBlocked(_ context.Context, callerUserID, inviteeUserID string) (bool, error) {
	return check(callerUserID, inviteeUserID)
}

func callChatFromPublic(chat chatPublic) domain.CallChat {
	members := make([]string, 0, len(chat.Members))
	for _, member := range chat.Members {
		members = append(members, member.ID)
	}
	return domain.CallChat{ID: chat.ID, Type: domain.ChatType(chat.Type), Members: members}
}

func (s *Server) configureSockets() {
	realtimetransport.ConfigureSocketLifecycle(s.sockets, realtimetransport.SocketLifecycleHandlers{
		Authenticate: func(params map[string]string) bool {
			token := strings.TrimSpace(params["token"])
			if token == "" {
				return false
			}
			claims, err := parseAccessToken(s.cfg, token)
			if err != nil {
				return false
			}
			user, err := s.getUserByID(claims.UserID)
			return err == nil && user.IsActive
		},
		Connect: func(socket *socketio.Socket) {
			token := s.socketAccessToken(socket)
			if token == "" {
				_ = socket.Disconnect()
				return
			}
			claims, err := parseAccessToken(s.cfg, token)
			if err != nil {
				_ = socket.Disconnect()
				return
			}
			user, err := s.getUserByID(claims.UserID)
			if err != nil || !user.IsActive {
				_ = socket.Disconnect()
				return
			}

			s.sessions.Register(user, socket)
			if err := cache.NewPresenceService(s.cache).MarkOnline(context.Background(), user.ID, 60); err != nil {
				s.logger.Warnf("realtime", "presence online update failed user_id=%s error=%v", user.ID, err)
			}
			socket.Join("user:" + user.ID)

			chats, err := s.listChats(user)
			if err == nil {
				for _, chat := range chats {
					socket.Join("chat:" + chat.ID)
				}
			}

			if ringing := s.getRingingSessionForUser(user.ID); ringing != nil {
				payloadMap := ringing.PublicPayload()
				s.logger.Infof("realtime.call", "call:ringing re-emitted on reconnect user_id=%s chat_id=%s socket_id=%s", user.ID, ringing.ChatID, socket.Id)
				_ = socket.Emit("call:ringing", payloadMap)
			} else if active := s.getActiveCallSessionForUser(user.ID); active != nil {
				payloadMap := active.PublicPayload()
				s.logger.Infof("realtime.call", "call:sync re-emitted on reconnect user_id=%s chat_id=%s state=%s", user.ID, active.ChatID, active.State)
				_ = socket.Emit("call:sync", payloadMap)
			}

			go func() {
				events := s.drainPendingEvents(context.Background(), user.ID)
				for _, ev := range events {
					if err := socket.Emit(ev.Event, ev.Payload); err != nil {
						s.logger.Warnf("realtime", "replay event failed user_id=%s event=%s: %v", user.ID, ev.Event, err)
					}
				}
				_ = socket.Emit("sync:needed", map[string]any{"ts": time.Now().UTC().Format(time.RFC3339)})
			}()

			realtimetransport.RegisterCoreEvents(socket, realtimetransport.CoreEventHandlers{
				Disconnect:  func(_ *socketio.EventPayload) { s.onSocketDisconnect(socket, user) },
				HealthPing:  func(ev *socketio.EventPayload) { s.onSocketHealthPing(socket, ev) },
				AppState:    func(ev *socketio.EventPayload) { s.onSocketAppState(socket, user, ev) },
				MessageSend: func(ev *socketio.EventPayload) { s.onSocketMessageSend(socket, user, ev) },
				MessageRead: func(ev *socketio.EventPayload) { s.onSocketMessageRead(socket, user, ev) },
				TypingStart: func(ev *socketio.EventPayload) { s.onSocketTyping(socket, user, ev, true) },
				TypingStop:  func(ev *socketio.EventPayload) { s.onSocketTyping(socket, user, ev, false) },
			})
			s.registerCallSocketHandlers(socket, user)
			s.registerCanvasSocketHandlers(socket, user)
			s.registerChecklistSocketHandlers(socket, user)
		},
	})
}

func (s *Server) onSocketDisconnect(socket *socketio.Socket, user userPublic) {
	s.sessions.Unregister(user.ID, socket.Id)
	if s.sessions.IsOnline(user.ID) {
		return
	}
	userID := user.ID
	go func() {
		grace := 2 * time.Second
		if s.userHasActiveCall(userID) {
			grace = 10 * time.Second
		}
		time.Sleep(grace)
		if s.sessions.IsOnline(userID) {
			return
		}
		if ended, ok := s.endCallForUser(userID); ok {
			s.recordCallHistory(ended, "disconnected")
			payload := ended.ActionPayload(map[string]any{
				"reason":  "disconnected",
				"endedAt": nowString(),
			})
			s.emitCallToParticipants(ended, "call:ended", payload)
		}
	}()
	if err := cache.NewPresenceService(s.cache).MarkOffline(context.Background(), userID); err != nil {
		s.logger.Warnf("realtime", "presence offline update failed user_id=%s error=%v", userID, err)
	}
	if err := s.profile.RecordLastSeen(context.Background(), userID, time.Now()); err != nil {
		s.logger.Warnf("realtime", "last seen update failed user_id=%s error=%v", userID, err)
	}
}

func (s *Server) onSocketHealthPing(socket *socketio.Socket, event *socketio.EventPayload) {
	payload := map[string]any{}
	if len(event.Data) > 0 {
		payload = toMap(event.Data[0])
	}
	_ = socket.Emit("health:pong", map[string]any{
		"status": "ok",
		"echo":   payload,
	})
}

func (s *Server) onSocketAppState(socket *socketio.Socket, user userPublic, event *socketio.EventPayload) {
	var payload struct {
		Foreground   bool   `json:"foreground"`
		ActiveChatID string `json:"activeChatId"`
	}
	if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
		return
	}
	s.sessions.SetAppState(socket.Id, payload.Foreground, payload.ActiveChatID)
	s.logger.Debugf("realtime.app_state", "socket_id=%s user_id=%s foreground=%v", socket.Id, user.ID, payload.Foreground)
}

func (s *Server) onSocketMessageSend(socket *socketio.Socket, user userPublic, event *socketio.EventPayload) {
	payload := socketSendMessageRequest{}
	if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || strings.TrimSpace(payload.ChatID) == "" {
		s.emitSocketError(socket, payload.ClientMessageID, "Invalid message payload")
		if event.Ack != nil {
			event.Ack(realtimetransport.ErrorAck(payload.ClientMessageID, "Invalid message payload"))
		}
		return
	}
	if err := s.checkSocketRateLimit(socket, user, payload.ClientMessageID, event); err != nil {
		return
	}
	message, err := s.createMessageFromSocket(user, payload)
	if err != nil {
		s.emitSocketError(socket, payload.ClientMessageID, err.Error())
		if event.Ack != nil {
			event.Ack(realtimetransport.ErrorAck(payload.ClientMessageID, err.Error()))
		}
		return
	}
	if event.Ack != nil {
		event.Ack(message)
	}
}

func (s *Server) checkSocketRateLimit(socket *socketio.Socket, user userPublic, clientMessageID *string, event *socketio.EventPayload) error {
	_, err := cache.NewRateLimitService(s.cache).CheckMessage(context.Background(), user.ID)
	if err == nil {
		return nil
	}
	message := "Could not verify rate limit"
	var limitErr cache.RateLimitExceededError
	if errors.As(err, &limitErr) {
		message = "Rate limit exceeded"
	}
	s.emitSocketError(socket, clientMessageID, message)
	if event.Ack != nil {
		event.Ack(realtimetransport.ErrorAck(clientMessageID, message))
	}
	return err
}

func (s *Server) onSocketMessageRead(socket *socketio.Socket, user userPublic, event *socketio.EventPayload) {
	var payload socketReadRequest
	if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || strings.TrimSpace(payload.MessageID) == "" {
		s.emitSocketError(socket, nil, "Invalid read payload")
		return
	}
	message, chatID, err := s.markMessageRead(context.Background(), user, payload.MessageID)
	if err != nil {
		s.emitSocketError(socket, nil, err.Error())
		return
	}
	s.emitMessageRead(chatID, message.ID, user.ID)
	s.bumpChatHistoryRevision(context.Background(), chatID)
}

func (s *Server) onSocketTyping(socket *socketio.Socket, user userPublic, event *socketio.EventPayload, isTyping bool) {
	var payload socketTypingRequest
	if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil {
		s.emitSocketError(socket, nil, "Invalid typing payload")
		return
	}
	if err := s.emitTyping(payload.ChatID, user, isTyping); err != nil {
		s.emitSocketError(socket, nil, err.Error())
	}
}

func (s *Server) startBrokerConsumers() {
	handler := realtimetransport.NewMessageBrokerHandler(realtimetransport.MessageBrokerDependencies{
		Members: func(chatID string) ([]string, error) {
			members, err := s.chatMembers(chatID)
			if err != nil {
				return nil, err
			}
			ids := make([]string, 0, len(members))
			for _, member := range members {
				ids = append(ids, member.ID)
			}
			return ids, nil
		},
		Online: s.sessions.IsOnline,
		Emit:   s.emitToUserRoom,
		Seen:   s.eventDeduplicator().Seen,
	})
	s.lifecycle.Go(func(ctx context.Context) {
		workruntime.RunBrokerSubscription(ctx, s.broker, brokerChannelMessages, handler, 800*time.Millisecond, func(err error) {
			s.logger.Warnf("realtime", "broker subscribe failed channel=%s error=%v", brokerChannelMessages, err)
		})
	})
}

func (s *Server) registerCallSocketHandlers(socket *socketio.Socket, user userPublic) {
	realtimetransport.RegisterCallEventCoordinator(socket, realtimetransport.CallActor{UserID: user.ID, SocketID: socket.Id}, realtimetransport.CallStart, realtimetransport.CallbackCallCoordinator{Start: func(event *socketio.EventPayload) {
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
		payloadMap := session.PublicPayload()
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
		for _, inviteeID := range session.RingingInviteeIDs() {
			go s.notifyCallRinging(inviteeID, user.DisplayName, session.ChatID)
		}
	}})

	realtimetransport.RegisterCallEventCoordinator(socket, realtimetransport.CallActor{UserID: user.ID, SocketID: socket.Id}, realtimetransport.CallJoin, realtimetransport.CallbackCallCoordinator{Join: func(event *socketio.EventPayload) {
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
		payloadMap := session.ActionPayload(nil)
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
	}})

	realtimetransport.RegisterCallEventCoordinator(socket, realtimetransport.CallActor{UserID: user.ID, SocketID: socket.Id}, realtimetransport.CallInvite, realtimetransport.CallbackCallCoordinator{Invite: func(event *socketio.EventPayload) {
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
		payloadMap := session.ActionPayload(map[string]any{"invitedUserIds": added})
		s.emitCallToActiveParticipants(session, "call:participant-updated", payloadMap)
		for _, inviteeID := range added {
			s.emitCallToUser(inviteeID, "call:ringing", session.PublicPayload())
			go s.notifyCallRinging(inviteeID, user.DisplayName, session.ChatID)
		}
		s.scheduleCallTimeout(session.ChatID, session.ExpiresAt, user.DisplayName)
	}})

	realtimetransport.RegisterCallEventCoordinator(socket, realtimetransport.CallActor{UserID: user.ID, SocketID: socket.Id}, realtimetransport.CallAccept, realtimetransport.CallbackCallCoordinator{Accept: func(event *socketio.EventPayload) {
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
		payloadMap := session.ActionPayload(nil)
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
	}})

	realtimetransport.RegisterCallEventCoordinator(socket, realtimetransport.CallActor{UserID: user.ID, SocketID: socket.Id}, realtimetransport.CallDecline, realtimetransport.CallbackCallCoordinator{Decline: func(event *socketio.EventPayload) {
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
		shouldEnd := !session.HasLiveParticipants() || (session.ConnectedOrConnectingCount() == 0 && len(session.RingingInviteeIDs()) == 0)
		s.calls.Unlock()
		if shouldEnd {
			ended, endedOK := s.endCallSession(session.ChatID)
			if !endedOK {
				return
			}
			s.recordCallHistory(ended, "declined")
			payloadMap := ended.ActionPayload(map[string]any{"reason": "declined", "endedAt": nowString()})
			s.emitCallToParticipants(ended, "call:declined", payloadMap)
			s.emitCallToParticipants(ended, "call:ended", payloadMap)
			return
		}
		payloadMap := session.ActionPayload(map[string]any{"reason": "declined", "userId": user.ID, "endedAt": nowString()})
		s.emitCallToUser(user.ID, "call:declined", payloadMap)
		s.emitCallToUser(user.ID, "call:ended", payloadMap)
		s.emitCallToActiveParticipants(session, "call:participant-updated", payloadMap)
	}})

	realtimetransport.RegisterCallEventCoordinator(socket, realtimetransport.CallActor{UserID: user.ID, SocketID: socket.Id}, realtimetransport.CallCancel, realtimetransport.CallbackCallCoordinator{Cancel: func(event *socketio.EventPayload) {
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
		ringingIDs := session.RingingInviteeIDs()
		ended, endedOK := s.endCallSession(session.ChatID)
		if !endedOK {
			return
		}
		s.recordCallHistory(ended, "canceled")
		payloadMap := ended.ActionPayload(map[string]any{"reason": "canceled", "endedAt": nowString()})
		s.emitCallToParticipants(ended, "call:canceled", payloadMap)
		s.emitCallToParticipants(ended, "call:ended", payloadMap)
		if wasRinging {
			for _, id := range ringingIDs {
				go s.notifyCallMissed(id, user.DisplayName, ended.ChatID)
			}
		}
	}})

	realtimetransport.RegisterCallEventCoordinator(socket, realtimetransport.CallActor{UserID: user.ID, SocketID: socket.Id}, realtimetransport.CallLeave, realtimetransport.CallbackCallCoordinator{Leave: func(event *socketio.EventPayload) {
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
		payloadMap := left.ActionPayload(map[string]any{"reason": "left", "userId": user.ID, "endedAt": nowString()})
		s.emitCallToUser(user.ID, "call:ended", payloadMap)
		if ended {
			s.recordCallHistory(left, "ended")
			s.emitCallToParticipants(left, "call:ended", payloadMap)
		} else {
			s.emitCallToActiveParticipants(left, "call:participant-updated", payloadMap)
		}
	}})

	realtimetransport.RegisterCallEventCoordinator(socket, realtimetransport.CallActor{UserID: user.ID, SocketID: socket.Id}, realtimetransport.CallEnd, realtimetransport.CallbackCallCoordinator{End: func(event *socketio.EventPayload) {
		var payload socketCallActionRequest
		if len(event.Data) == 0 || decodeSocketPayload(event.Data[0], &payload) != nil || (strings.TrimSpace(payload.ChatID) == "" && strings.TrimSpace(payload.RoomID) == "") {
			_ = socket.Emit("call:error", map[string]any{"message": "Invalid call end payload"})
			return
		}
		session, ok := s.resolveCallSession(payload.ChatID, payload.RoomID)
		if !ok || !isCallParticipant(session, user.ID) {
			return
		}
		if session.CallerUserID != user.ID && len(session.ActiveParticipantIDs()) > 2 {
			left, leftOK, ended := s.leaveCallSession(session.ChatID, user.ID)
			if !leftOK {
				return
			}
			payloadMap := left.ActionPayload(map[string]any{"reason": "left", "userId": user.ID, "endedAt": nowString()})
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
		payloadMap := ended.ActionPayload(map[string]any{"reason": "ended", "endedAt": nowString()})
		s.emitCallToParticipants(ended, "call:ended", payloadMap)
	}})

	realtimetransport.RegisterCallEventCoordinator(socket, realtimetransport.CallActor{UserID: user.ID, SocketID: socket.Id}, realtimetransport.CallSignal, realtimetransport.CallbackCallCoordinator{Signal: func(event *socketio.EventPayload) {
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
			for _, id := range session.ActiveParticipantIDs() {
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
	}})
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

func isCallParticipant(session *callSession, userID string) bool {
	return session != nil && session.IsParticipant(userID)
}

func isCallParticipantAny(session *callSession, userID string) bool {
	return session != nil && session.HasParticipant(userID)
}

func (s *Server) emitCallToParticipants(session *callSession, event string, payload any) {
	for _, userID := range session.ParticipantIDs() {
		s.emitCallToUser(userID, event, payload)
	}
}

func (s *Server) emitCallToActiveParticipants(session *callSession, event string, payload any) {
	for _, userID := range session.ActiveParticipantIDs() {
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
		_ = s.callPersistence.Create(ctx, featurecalls.Session{ID: sess.ID, ChatID: sess.ChatID, CallerID: sess.CallerUserID, CalleeID: sess.CalleeUserID, CallType: sess.CallType, Topology: string(sess.Topology), State: string(sess.State), CreatedAt: sess.CreatedAt})
		s.persistCallParticipants(ctx, sess)
		s.persistCallSession(ctx, sess, 60*time.Second)
	}(session)
	return session, nil
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
	switch conflict.Kind {
	case runtime.CallConflictChat:
		return fmt.Errorf("call already in progress for this chat")
	case runtime.CallConflictInitiator:
		return fmt.Errorf("you are already in another call")
	case runtime.CallConflictParticipant:
		return fmt.Errorf("participant is busy in another call")
	default:
		return fmt.Errorf("call conflict")
	}
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

func (s *Server) indexCallSession(session *callSession)   { s.calls.IndexLocked(session) }
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
		_ = s.callPersistence.SetState(ctx, sess.ID, string(st))
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
	return (livekit.TokenIssuer{URL: s.cfg.LiveKitURL, APIKey: s.cfg.LiveKitAPIKey, APISecret: s.cfg.LiveKitAPISecret}).Configured()
}

func (s *Server) maybePromoteToSFULocked(session *callSession) (bool, error) {
	if !runtime.ShouldPromoteCallToSFU(session.ConnectedOrConnectingCount(), maxMeshParticipants, session.Topology == callTopologySFU) {
		return false, nil
	}
	if !s.isSFUConfigured() {
		return false, fmt.Errorf("group call limit reached; SFU is not configured")
	}
	session.Topology = callTopologySFU
	go func(sess *callSession) {
		ctx := context.Background()
		_ = s.callPersistence.SetTopology(ctx, sess.ID, string(callTopologySFU))
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
	participantIDs := session.ParticipantIDs()
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
	if err := s.callPersistence.RecordHistory(context.Background(), featurecalls.HistoryRecord{MessageID: messageID, ChatID: session.ChatID, SenderID: session.CallerUserID, EncryptionMetadata: string(metadata), CreatedAt: now, UpdatedAt: now}); err != nil {
		s.logger.Warnf("realtime.call", "call history insert failed chat_id=%s error=%v", session.ChatID, err)
		return
	}
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
	session, ok := s.calls.RemoveByChat(chatID)
	if !ok {
		return nil, false
	}
	s.stopActiveTranscriptionForEndedCall(session)
	go func(sess *callSession) {
		ctx := context.Background()
		dur := int(time.Since(sess.CreatedAt).Seconds())
		_ = s.callPersistence.End(ctx, sess.ID, dur, time.Now().UTC())
		s.deleteCallSession(ctx, sess.ID)
		s.deleteCallSession(ctx, sess.ChatID)
	}(session)
	return session, true
}

func (s *Server) leaveCallSession(chatID, userID string) (*callSession, bool, bool) {
	participant := false
	session, found, ended := s.calls.UpdateByChat(chatID, func(session *callSession) bool {
		if !isCallParticipantAny(session, userID) {
			return false
		}
		participant = true
		s.setParticipantState(session, userID, participantLeft)
		return !session.HasLiveParticipants()
	})
	if !found || !participant {
		return nil, false, false
	}
	if ended {
		s.stopActiveTranscriptionForEndedCall(session)
		go func(sess *callSession) {
			ctx := context.Background()
			dur := int(time.Since(sess.CreatedAt).Seconds())
			_ = s.callPersistence.End(ctx, sess.ID, dur, time.Now().UTC())
			s.deleteCallSession(ctx, sess.ID)
			s.deleteCallSession(ctx, sess.ChatID)
		}(session)
	} else {
		go func(sess *callSession) {
			ctx := context.Background()
			s.persistCallParticipants(ctx, sess)
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
	return nil, false
}

func (s *Server) userHasActiveCall(userID string) bool {
	s.calls.Lock()
	defer s.calls.Unlock()
	_, ok := s.calls.ActiveRoomLocked(userID)
	return ok
}

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
	runtime.StartCallTimeout(runtime.CallTimeout{
		ExpiresAt: expiresAt,
		Run: func(context.Context) {
			session, ok := s.getCallSession(chatID)
			if !ok {
				return
			}
			if !session.ExpiresAt.Equal(expiresAt) {
				return
			}
			ringing := session.RingingInviteeIDs()
			if len(ringing) == 0 {
				return
			}
			if session.State == callStateConnected || session.ConnectedOrConnectingCount() > 1 {
				s.calls.Lock()
				for _, id := range ringing {
					s.setParticipantState(session, id, participantLeft)
				}
				payload := session.ActionPayload(map[string]any{"reason": "timeout", "endedAt": nowString()})
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
			payload := ended.ActionPayload(map[string]any{"reason": "timeout", "endedAt": nowString()})
			s.emitCallToParticipants(ended, "call:timeout", payload)
			s.emitCallToParticipants(ended, "call:ended", payload)
			s.logger.Warnf("realtime.call", "call timed out chat_id=%s room_id=%s caller=%s", ended.ChatID, ended.ID, ended.CallerUserID)
			for _, id := range ended.RingingInviteeIDs() {
				go s.notifyCallMissed(id, callerName, ended.ChatID)
			}
			for _, id := range ringing {
				go s.notifyCallMissed(id, callerName, ended.ChatID)
			}
		},
	})
}

func (s *Server) persistCallParticipants(ctx context.Context, session *callSession) {
	if session == nil {
		return
	}
	s.calls.Lock()
	participants := make([]callParticipant, 0, len(session.Participants))
	for _, p := range session.Participants {
		if p == nil {
			continue
		}
		participants = append(participants, *p)
	}
	s.calls.Unlock()
	for _, p := range participants {
		var joinedAt *time.Time
		if !p.JoinedAt.IsZero() {
			t := p.JoinedAt.UTC()
			joinedAt = &t
		}
		_ = s.callPersistence.UpsertParticipant(ctx, featurecalls.Participant{RoomID: session.ID, UserID: p.UserID, Role: p.Role, State: string(p.State), JoinedAt: joinedAt})
	}
}

func (s *Server) mintLiveKitToken(roomName, identity, name string) (string, error) {
	return livekit.TokenIssuer{URL: s.cfg.LiveKitURL, APIKey: s.cfg.LiveKitAPIKey, APISecret: s.cfg.LiveKitAPISecret}.Mint(roomName, identity, name)
}

func (s *Server) sfuHandler() httptransport.SFUTokenHandler {
	return httptransport.NewSFUTokenHandler(httptransport.SFUTokenOperations{
		IsSFUConfigured: s.isSFUConfigured,
		CreateToken: func(ctx context.Context, roomID string, actor httptransport.SFUTokenActor) (any, int, string) {
			session, ok := s.resolveCallSession(roomID, roomID)
			if !ok {
				chat, err := s.buildChatPublic(roomID, userPublic{ID: actor.ID, DisplayName: actor.DisplayName})
				if err == nil && chat.Type == "voice" {
					session, _, err = s.joinCallSession(chat, actor.ID, "audio")
					if err != nil {
						return nil, http.StatusInternalServerError, "Could not join voice session"
					}
					ok = true
				}
			}
			if !ok || !isCallParticipant(session, actor.ID) {
				return nil, http.StatusForbidden, "Call not available"
			}
			if session.Topology != callTopologySFU {
				promoted, err := s.promoteCallToSFU(session)
				if err != nil {
					return nil, http.StatusServiceUnavailable, err.Error()
				}
				if !promoted && session.Topology != callTopologySFU {
					return nil, http.StatusConflict, "Call is still in mesh mode"
				}
			}
			token, err := s.mintLiveKitToken(session.ID, actor.ID, actor.DisplayName)
			if err != nil {
				return nil, http.StatusInternalServerError, "Could not mint SFU token"
			}
			return map[string]any{
				"token":    token,
				"url":      s.cfg.LiveKitURL,
				"roomName": session.ID,
				"roomId":   session.ID,
				"chatId":   session.ChatID,
			}, http.StatusOK, ""
		},
	})
}

func (s *Server) emitToUserRoom(userID, event string, payload any) error {
	return s.sockets.To("user:"+userID).Emit(event, payload)
}

func (s *Server) emitSocketError(socket *socketio.Socket, clientMessageID *string, message string) {
	_ = socket.Emit("error", realtimetransport.ErrorPayload(clientMessageID, message))
}

func (s *Server) emitCallToUser(userID, event string, payload any) {
	targets := s.sessions.SocketsForUser(userID)
	for _, sock := range targets {
		if err := sock.Emit(event, payload); err != nil {
			s.logger.Warnf("realtime.call", "emitCallToUser: emit failed user_id=%s event=%s socket_id=%s error=%v", userID, event, sock.Id, err)
		} else {
			s.logger.Infof("realtime.call", "emitCallToUser: emitted user_id=%s event=%s socket_id=%s", userID, event, sock.Id)
		}
	}
	if s.broker != nil {
		eventID := fmt.Sprintf("call:%s:%s:%d", userID, event, time.Now().UnixNano())
		_ = s.eventDeduplicator().Seen(eventID)
		go func() {
			_ = s.broker.Publish(context.Background(), brokerChannelMessages, ports.Event{
				"type":       "call.user",
				"event_id":   eventID,
				"user_id":    userID,
				"event_name": event,
				"payload":    payload,
			})
		}()
	}
	if len(targets) == 0 {
		s.logger.Warnf("realtime.call", "emitCallToUser: no sockets for user_id=%s event=%s — queueing", userID, event)
		if strings.HasPrefix(event, "call:") {
			go s.enqueueEventForUser(context.Background(), userID, event, payload)
		}
	}
}

func (s *Server) socketQueryValue(socket *socketio.Socket, key string) string {
	return realtimetransport.QueryValue(socket, key)
}

func (s *Server) socketAccessToken(socket *socketio.Socket) string {
	return realtimetransport.AccessToken(socket)
}

func decodeSocketPayload(value any, target any) error {
	return realtimetransport.DecodePayload(value, target)
}

func toMap(value any) map[string]any {
	return realtimetransport.MapPayload(value)
}

func (s *Server) handleGetIceServers(w http.ResponseWriter, r *http.Request, user userPublic) {
	handler := httptransport.NewICEServerHandler(httptransport.ICEServerOperations{Resolve: func(_ context.Context, actor httptransport.ICEServerActor) ([]httptransport.ICEServer, error) {
		servers := []httptransport.ICEServer{{URLs: []string{"stun:stun.l.google.com:19302"}}}
		host := s.resolveTurnHost(user)
		if host != "" && s.cfg.TurnEnabled {
			servers = append(servers, httptransport.ICEServer{URLs: []string{"turn:" + host + ":3478?transport=udp", "turn:" + host + ":3478?transport=tcp"}, Username: s.cfg.TurnUsername, Credential: s.cfg.TurnPassword})
			s.logger.Infof("realtime.call", "ice-servers served turn_host=%s user_id=%s", host, actor.UserID)
		} else {
			s.logger.Warnf("realtime.call", "ice-servers served without TURN (host=%q enabled=%v) user_id=%s", host, s.cfg.TurnEnabled, actor.UserID)
		}
		return servers, nil
	}})
	handler.Get(w, r, httptransport.ICEServerActor{UserID: user.ID, FamilyID: user.FamilyID})
}

func (s *Server) resolveTurnHost(user userPublic) string {
	if s.cfg.TurnHost != "" {
		return s.cfg.TurnHost
	}

	family, err := s.getFamily(user.FamilyID)
	if err == nil && family.PublicAPIURL != nil {
		if parsed, parseErr := url.Parse(*family.PublicAPIURL); parseErr == nil {
			host := parsed.Hostname()

			if !strings.Contains(host, "trycloudflare.com") &&
				!strings.Contains(host, "loca.lt") &&
				!strings.Contains(host, "localtunnel") {
				return host
			}
		}
	}

	ip, err := detectPublicIPv4()
	if err == nil {
		return ip
	}

	return ""
}
